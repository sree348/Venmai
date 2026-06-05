export async function queryWithGroq(
  prompt: string,
  tenantId: string,
  history: any[]
): Promise<{ sql: string; insight: string }> {
  console.log('[Mock Groq Service] queryWithGroq called with prompt:', prompt);
  return {
    sql: 'SELECT * FROM GOLD_CAMPAIGN_DAILY LIMIT 1',
    insight: 'This is a mock insight from the placeholder Groq service.'
  };
}
