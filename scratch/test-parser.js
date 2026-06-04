function escapeRawNewlinesInJsonString(str) {
  let result = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '\\') {
      escape = !escape;
      result += char;
    } else if (char === '"') {
      if (!escape) {
        inString = !inString;
      }
      escape = false;
      result += char;
    } else if (char === '\n' || char === '\r') {
      if (inString) {
        result += '\\n';
      } else {
        result += char;
      }
      escape = false;
    } else {
      escape = false;
      result += char;
    }
  }
  return result;
}

function tryParseMarkdownResponse(content) {
  const clean = content.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
  
  const hasHeaders = 
    clean.includes('### 🚨 URGENT') || 
    clean.includes('### 📊 PERFORMANCE') || 
    clean.includes('### 💡 RECOMMENDATIONS') || 
    clean.includes('### ✅ PRIORITY');
    
  if (!hasHeaders) {
    return null;
  }

  let widget = null;
  let textPart = clean;

  const widgetRegex = /(?:\*\*Widget\*\*|Widget):?\s*```json\s*([\s\S]*?)```/i;
  const match = clean.match(widgetRegex);
  if (match) {
    try {
      widget = JSON.parse(escapeRawNewlinesInJsonString(match[1].trim()));
    } catch (e) {
      console.warn('Failed to parse widget from raw markdown:', e);
    }
    textPart = clean.replace(widgetRegex, '').trim();
  }

  return {
    action: 'none',
    final_answer: textPart,
    widget: widget
  };
}

const sampleOutput = `<think>
Okay, let's analyze the query...
</think>

### 🚨 URGENT ISSUES (needs action today)
- CAI_Branding: ₹6,407 spent with 0 conversions.

### 📊 PERFORMANCE SUMMARY (ranked worst to best)
1. CAI_Branding: 0% conversions.

### 💡 RECOMMENDATIONS (specific, numbered)
1. Pause campaigns.

### ✅ PRIORITY ACTION LIST (ranked 1 to N)
1. Pause branding.

**Widget**:
\`\`\`json
{
  "chart_type": "bar_chart",
  "title": "CPC vs. Conversions by Campaign",
  "config": {
    "x_axis": "campaign_name",
    "y_axis": "cpc",
    "sort": "ASC"
  },
  "sql": "SELECT campaign_name FROM GOLD_CAMPAIGN_DAILY"
}
\`\`\``;

console.log("Parsing result:", tryParseMarkdownResponse(sampleOutput));
