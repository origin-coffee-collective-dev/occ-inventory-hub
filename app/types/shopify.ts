export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  vendor: string;
  productType: string;
  tags: string[];
  descriptionHtml: string;
  featuredImage: {
    url: string;
    altText: string | null;
  } | null;
  images: {
    edges: Array<{
      node: {
        url: string;
        altText: string | null;
      };
    }>;
  };
  variants: {
    edges: Array<{
      node: ShopifyVariant;
    }>;
  };
}

export interface ShopifyVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  barcode: string | null;
  weight?: number | null;
  weightUnit?: 'GRAMS' | 'KILOGRAMS' | 'OUNCES' | 'POUNDS';
  inventoryQuantity: number | null;
  inventoryItem: {
    id: string;
  };
  selectedOptions: Array<{
    name: string;
    value: string;
  }>;
  image: {
    url: string;
    altText: string | null;
  } | null;
}

export interface ShopifyInventoryLevel {
  id: string;
  available: number;
  inventoryItemId: string;
  location: {
    id: string;
    name: string;
  };
}

export interface ShopifyLocation {
  id: string;
  name: string;
  isActive: boolean;
  isPrimary: boolean;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  email: string | null;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        quantity: number;
        sku: string | null;
        variant: {
          id: string;
        } | null;
        originalUnitPriceSet: {
          shopMoney: {
            amount: string;
          };
        };
      };
    }>;
  };
  shippingAddress: ShopifyAddress | null;
}

export interface ShopifyAddress {
  firstName: string | null;
  lastName: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  country: string | null;
  countryCode: string | null;
  zip: string | null;
  phone: string | null;
}

export interface ShopifyDraftOrder {
  id: string;
  name: string;
  order: {
    id: string;
    name: string;
  } | null;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
    extensions?: {
      code: string;
      requestId: string;
    };
  }>;
  extensions?: {
    cost: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}
