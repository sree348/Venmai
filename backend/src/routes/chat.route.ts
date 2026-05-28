import { Router } from 'express';
import { executeReadOnlySql } from '../services/db.service.js';
import { queryWithGroq } from '../services/groq.service.js';
import { prisma } from '../services/prisma.service.js';
import { prepareAiSql } from '../services/sql-safety.service.js';
import { requireJwtAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

export const chatRouter = Router();

// POST /api/v1/chat
chatRouter.post('/chat', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { prompt, tenantId = req.auth!.tenantId, history = [] } = req.body || {};

    if (!prompt || !tenantId) {
      return res.status(400).json({ error: 'prompt and tenantId are required.' });
    }

    if (req.auth!.tenantId !== 'agency' && tenantId !== req.auth!.tenantId) {
      return res.status(403).json({ error: 'Token is not allowed to query this tenant or client scope.' });
    }

    // Call Groq to get the SQL and initial structured response
    const spec = await queryWithGroq(prompt, tenantId, history);
    
    // Execute the returned SQL against the DB
    let rows: any[] = [];
    if (spec.sql) {
      const sqlToRun = prepareAiSql(spec.sql, tenantId);
      console.log('Validated AI SQL to run against campaign_data:', sqlToRun);

      try {
        rows = await executeReadOnlySql(sqlToRun);
      } catch (dbErr: any) {
        console.error('SQL execution failed:', dbErr);
        throw new Error(`Failed to execute AI-generated SQL: ${dbErr.message}`);
      }
    }

    const widget = {
      ...spec,
      data: rows,
    };

    // Store each turn in ConversationHistory table
    // 1. Store user message
    await prisma.conversationHistory.create({
      data: {
        tenantId,
        role: 'user',
        content: prompt,
      },
    });

    // 2. Store assistant message
    const assistantPayload = {
      widget,
      insight: spec.insight,
    };

    await prisma.conversationHistory.create({
      data: {
        tenantId,
        role: 'assistant',
        content: JSON.stringify(assistantPayload),
      },
    });

    return res.json({
      widget,
      insight: spec.insight,
    });
  } catch (error: any) {
    console.error('Chat error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error during chat analysis.',
    });
  }
});

// GET /api/v1/chat/history?clientId=
chatRouter.get('/chat/history', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clientId = req.query.clientId as string;
    if (!clientId) {
      return res.status(400).json({ error: 'clientId query parameter is required.' });
    }

    if (req.auth!.tenantId !== 'agency' && clientId !== req.auth!.tenantId) {
      return res.status(403).json({ error: 'Token is not allowed to read this chat history.' });
    }

    // Fetch the last 50 messages from ConversationHistory, sorted by createdAt ASC
    const history = await prisma.conversationHistory.findMany({
      where: {
        tenantId: clientId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 50,
    });

    // Format the response. If the role is assistant, parse the content as JSON to retrieve the widget.
    const messages = history.map(msg => {
      let content = msg.content;
      let widget = null;
      let insight = msg.content;

      if (msg.role === 'assistant') {
        try {
          const parsed = JSON.parse(msg.content);
          widget = parsed.widget;
          insight = parsed.insight || parsed.widget?.insight || '';
          content = insight;
        } catch (e) {
          // Fallback if not valid JSON
        }
      }

      return {
        id: msg.id,
        tenantId: msg.tenantId,
        role: msg.role,
        content,
        widget,
        insight,
        createdAt: msg.createdAt,
      };
    });

    return res.json(messages);
  } catch (error: any) {
    return next(error);
  }
});

// DELETE /api/v1/chat/history?clientId=
chatRouter.delete('/chat/history', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clientId = req.query.clientId as string;
    if (!clientId) {
      return res.status(400).json({ error: 'clientId query parameter is required.' });
    }

    if (req.auth!.tenantId !== 'agency' && clientId !== req.auth!.tenantId) {
      return res.status(403).json({ error: 'Token is not allowed to clear this chat history.' });
    }

    await prisma.conversationHistory.deleteMany({
      where: {
        tenantId: clientId,
      },
    });

    return res.json({ success: true, message: 'Chat history cleared successfully.' });
  } catch (error: any) {
    return next(error);
  }
});
