import type { PageInfo } from '~/types/shopify';

export interface PaginatedResult<T> {
  items: T[];
  pageInfo: PageInfo;
}

export interface PaginationOptions {
  pageSize?: number;
  maxPages?: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 250;

/**
 * Generic type for Shopify admin GraphQL client
 */
export interface AdminGraphQLClient {
  (query: string, options?: { variables?: Record<string, unknown> }): Promise<{
    json: () => Promise<{ data: unknown; errors?: unknown }>;
  }>;
}

/**
 * Fetches all pages of a paginated GraphQL query using Shopify Admin API client
 */
export async function fetchAllPages<T, R>(
  graphql: AdminGraphQLClient,
  query: string,
  extractItems: (data: R) => T[],
  extractPageInfo: (data: R) => PageInfo,
  variables: Record<string, unknown> = {},
  options: PaginationOptions = {}
): Promise<T[]> {
  const pageSize = Math.min(options.pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const maxPages = options.maxPages || Infinity;

  const allItems: T[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    const response = await graphql(query, {
      variables: {
        ...variables,
        first: pageSize,
        after: cursor,
      },
    });

    const result = await response.json();
    const data = result.data as R;

    const items = extractItems(data);
    allItems.push(...items);

    const pageInfo = extractPageInfo(data);
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    pageCount++;

  } while (cursor && pageCount < maxPages);

  return allItems;
}

/**
 * Fetches a single page of results using Shopify Admin API client
 */
export async function fetchPage<T, R>(
  graphql: AdminGraphQLClient,
  query: string,
  extractItems: (data: R) => T[],
  extractPageInfo: (data: R) => PageInfo,
  variables: Record<string, unknown> = {},
  cursor?: string | null,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<PaginatedResult<T>> {
  const response = await graphql(query, {
    variables: {
      ...variables,
      first: Math.min(pageSize, MAX_PAGE_SIZE),
      after: cursor,
    },
  });

  const result = await response.json();
  const data = result.data as R;

  return {
    items: extractItems(data),
    pageInfo: extractPageInfo(data),
  };
}
