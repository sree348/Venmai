import { Router } from 'express';
import fs from 'node:fs/promises';
import { prisma } from '../services/prisma.service.js';
import { requireJwtAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  buildKnowledgeBaseReply,
  classifyAiIntent,
  exportAgentDataSnapshot,
  pruneCampaignDataOutsideBrainWindow,
  handleAgentChat,
  extractWidgetFromMarkdown,
} from '../services/ai-brain.service.js';
import { runAgentWorkflow } from '../services/agent.service.js';

export const chatRouter = Router();

chatRouter.post('/chat', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { prompt, tenantId = req.auth!.tenantId, clientId, history = [], pageContext } = req.body || {};

    if (!prompt || !tenantId) {
      return res.status(400).json({ error: 'prompt and tenantId are required.' });
    }

    if (req.auth!.tenantId !== 'agency' && tenantId !== req.auth!.tenantId) {
      return res.status(403).json({ error: 'Token is not allowed to query this tenant or client scope.' });
    }

    const classification = await classifyAiIntent(prompt);
    const intent = classification.intent;

    if (intent === 'knowledge_base') {
      const insight = await buildKnowledgeBaseReply(prompt);

      try {
        await prisma.conversationHistory.create({
          data: {
            tenantId,
            role: 'user',
            content: prompt,
          },
        });

        await prisma.conversationHistory.create({
          data: {
            tenantId,
            role: 'assistant',
            content: JSON.stringify({ widget: null, insight }),
          },
        });
      } catch (historyErr) {
        console.error('Failed to store conversation history:', historyErr);
      }

      return res.json({
        widget: null,
        insight,
        intent,
        dataSnapshot: null,
        prunedRows: 0,
      });
    }

    let mdSnapshot = '';
    let dataSnapshot = null;
    let prunedRows = 0;
    try {
      dataSnapshot = await exportAgentDataSnapshot(tenantId, clientId || tenantId);
      prunedRows = await pruneCampaignDataOutsideBrainWindow(tenantId, clientId || tenantId);
      if (dataSnapshot && dataSnapshot.mdPath) {
        mdSnapshot = await fs.readFile(dataSnapshot.mdPath, 'utf8');
      }
    } catch (snapshotErr) {
      console.error('AI Brain data snapshot failed; continuing with live Meta query path:', snapshotErr);
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    let liveInsight = '';
    let widget = null;

    if (anthropicKey) {
      console.log('[Chat Route] Claude key is active. Using handleAgentChat for single-turn snapshot analysis...');
      const chatResult = await handleAgentChat({
        prompt,
        mdSnapshot,
        conversationHistory: history,
      });
      liveInsight = chatResult.reply;
      widget = extractWidgetFromMarkdown(liveInsight);
    } else {
      console.log('[Chat Route] OpenAI key is active. Falling back to agentic workflow ReAct loop...');
      const reactResult = await runAgentWorkflow(
        prompt,
        tenantId,
        clientId || tenantId,
        history,
        pageContext
      );
      liveInsight = reactResult.insight;
      widget = reactResult.widget;
    }

    // Store each turn in ConversationHistory table
    // 1. Store user message
    try {
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
        insight: liveInsight,
      };

      await prisma.conversationHistory.create({
        data: {
          tenantId,
          role: 'assistant',
          content: JSON.stringify(assistantPayload),
        },
      });
    } catch (historyErr) {
      console.error('Failed to store conversation history:', historyErr);
    }

    return res.json({
      widget,
      insight: liveInsight,
      intent,
      dataSnapshot,
      prunedRows,
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
