const FORBIDDEN_SQL = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|execute|prepare|deallocate|vacuum|analyze|refresh|lock|listen|notify|set|reset|show)\b/i;
const COMMENT_PATTERN = /(--|\/\*|\*\/)/;
const TABLE_REF_PATTERN = /\b(from|join)\s+([a-zA-Z_][\w.]*)/gi;

function stripTrailingSemicolon(sql: string) {
  return sql.trim().replace(/;\s*$/, '').trim();
}

function assertSingleReadOnlyStatement(sql: string) {
  const trimmed = stripTrailingSemicolon(sql);

  if (!/^select\b/i.test(trimmed)) {
    throw new Error('AI-generated SQL must be a SELECT statement.');
  }

  if (trimmed.includes(';')) {
    throw new Error('AI-generated SQL must contain exactly one statement.');
  }

  if (COMMENT_PATTERN.test(trimmed)) {
    throw new Error('AI-generated SQL must not contain comments.');
  }

  if (FORBIDDEN_SQL.test(trimmed)) {
    throw new Error('AI-generated SQL contains a forbidden operation.');
  }

  const tableRefs = [...trimmed.matchAll(TABLE_REF_PATTERN)].map(match => match[2].toLowerCase());
  const invalidRefs = tableRefs.filter(ref => ref !== 'campaign_data');
  if (invalidRefs.length > 0) {
    throw new Error(`AI-generated SQL can only query campaign_data. Invalid reference: ${invalidRefs[0]}`);
  }

  if (tableRefs.length === 0) {
    throw new Error('AI-generated SQL must query campaign_data.');
  }

  return trimmed;
}

function removeExistingScopePredicates(sql: string) {
  return sql
    .replace(/\s+and\s+tenant_id\s*=\s*('[^']*'|"[^"]*"|[a-zA-Z0-9_-]+)/gi, '')
    .replace(/\s+where\s+tenant_id\s*=\s*('[^']*'|"[^"]*"|[a-zA-Z0-9_-]+)\s+and\s+/gi, ' WHERE ')
    .replace(/\s+where\s+tenant_id\s*=\s*('[^']*'|"[^"]*"|[a-zA-Z0-9_-]+)/gi, '')
    .replace(/\s+and\s+client_id\s*=\s*('[^']*'|"[^"]*"|[a-zA-Z0-9_-]+)/gi, '')
    .replace(/\s+where\s+client_id\s*=\s*('[^']*'|"[^"]*"|[a-zA-Z0-9_-]+)\s+and\s+/gi, ' WHERE ')
    .replace(/\s+where\s+client_id\s*=\s*('[^']*'|"[^"]*"|[a-zA-Z0-9_-]+)/gi, '');
}

function escapeSqlLiteral(value: string) {
  return value.replace(/'/g, "''");
}

function addScopePredicate(sql: string, predicate: string) {
  const clauseMatch = sql.match(/\s+(group\s+by|having|order\s+by|limit|offset)\b/i);
  const predicateTarget = clauseMatch ? sql.slice(0, clauseMatch.index).trim() : sql;
  const suffix = clauseMatch ? sql.slice(clauseMatch.index) : '';
  const hasWhere = /\bwhere\b/i.test(predicateTarget);

  return `${predicateTarget}${hasWhere ? ' AND' : ' WHERE'} ${predicate}${suffix}`;
}

function addResultLimit(sql: string) {
  return /\s+limit\s+\d+\s*$/i.test(sql) ? sql : `${sql} LIMIT 500`;
}

export function prepareAiSql(rawSql: string, scopeId: string) {
  const mappedSql = rawSql.replace(/\bGOLD_CAMPAIGN_DAILY\b/gi, 'campaign_data');
  const readOnlySql = assertSingleReadOnlyStatement(mappedSql);
  const unscopedSql = removeExistingScopePredicates(readOnlySql);
  const escapedScope = escapeSqlLiteral(scopeId || 'agency');

  const predicate = !scopeId || scopeId === 'agency'
    ? "tenant_id = 'agency'"
    : `tenant_id = 'agency' AND client_id = '${escapedScope}'`;

  const scopedSql = addResultLimit(addScopePredicate(unscopedSql, predicate));
  return assertSingleReadOnlyStatement(scopedSql);
}
