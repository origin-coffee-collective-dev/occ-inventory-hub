/**
 * GraphQL queries for fetching store locations
 */

export const LOCATIONS_QUERY = `
  query getLocations {
    locations(first: 1) {
      edges {
        node {
          id
          name
          isActive
        }
      }
    }
  }
`;

export interface LocationsQueryResult {
  locations: {
    edges: Array<{
      node: {
        id: string;
        name: string;
        isActive: boolean;
      };
    }>;
  };
}
