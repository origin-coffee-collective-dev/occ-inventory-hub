/**
 * GraphQL mutations for creating products on the owner's store
 */

export const PRODUCT_SET_MUTATION = `
  mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
    productSet(input: $input, synchronous: $synchronous) {
      product {
        id
        title
        handle
        status
        variants(first: 10) {
          edges {
            node {
              id
              title
              sku
              price
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export interface ProductSetInput {
  title: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  variants?: Array<{
    price: string;
    sku?: string;
    barcode?: string;
    optionValues: Array<{
      optionName: string;
      name: string;
    }>;
  }>;
  productOptions?: Array<{
    name: string;
    values: Array<{ name: string }>;
  }>;
}

export interface ProductSetResult {
  productSet: {
    product: {
      id: string;
      title: string;
      handle: string;
      status: string;
      variants: {
        edges: Array<{
          node: {
            id: string;
            title: string;
            sku: string | null;
            price: string;
          };
        }>;
      };
    } | null;
    userErrors: Array<{
      field: string[];
      message: string;
    }>;
  };
}

/**
 * Create a simple product with a single variant
 * This is the main function used for importing partner products
 */
export function buildProductSetInput(params: {
  title: string;
  descriptionHtml?: string;
  vendor: string;
  productType?: string;
  tags?: string[];
  sku: string;
  price: string;
  barcode?: string;
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
}): ProductSetInput {
  return {
    title: params.title,
    descriptionHtml: params.descriptionHtml,
    vendor: params.vendor,
    productType: params.productType,
    tags: params.tags,
    status: params.status || 'ACTIVE',
    // For a single-variant product, we need to define a "Title" option with "Default Title"
    productOptions: [
      {
        name: 'Title',
        values: [{ name: 'Default Title' }],
      },
    ],
    variants: [
      {
        price: params.price,
        sku: params.sku,
        barcode: params.barcode,
        optionValues: [
          {
            optionName: 'Title',
            name: 'Default Title',
          },
        ],
      },
    ],
  };
}
