import type { ShopifyProduct, PageInfo } from '~/types/shopify';

export const PRODUCTS_QUERY = `
  query getProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          status
          vendor
          productType
          tags
          descriptionHtml
          featuredImage {
            url
            altText
          }
          images(first: 10) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                barcode
                inventoryQuantity
                inventoryItem {
                  id
                }
                selectedOptions {
                  name
                  value
                }
                image {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  }
`;

export interface ProductsQueryResult {
  products: {
    pageInfo: PageInfo;
    edges: Array<{
      node: ShopifyProduct;
    }>;
  };
}

export interface ProductsQueryVariables {
  first: number;
  after?: string | null;
  query?: string;
}
