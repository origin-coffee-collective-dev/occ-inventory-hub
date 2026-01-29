import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { getAllPartners } from "~/lib/supabase.server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Store, CheckCircle, XCircle, Clock } from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { data: partners, error } = await getAllPartners();

  if (error) {
    console.error("Failed to fetch partners:", error);
  }

  return {
    partners: partners.map((p) => ({
      id: p.id,
      shop: p.shop,
      isActive: p.is_active,
      isDeleted: p.is_deleted,
      hasAccessToken: !!p.access_token,
      scope: p.scope,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      // Counts not available in simple query - can add later if needed
      _count: {
        productMappings: 0,
        partnerOrders: 0,
      },
    })),
  };
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusBadge(partner: {
  isActive: boolean;
  isDeleted: boolean;
  hasAccessToken: boolean;
}) {
  if (partner.isDeleted) {
    return <Badge variant="destructive">Deleted</Badge>;
  }
  if (!partner.hasAccessToken) {
    return <Badge variant="warning">No Token</Badge>;
  }
  if (!partner.isActive) {
    return <Badge variant="secondary">Inactive</Badge>;
  }
  return <Badge variant="success">Active</Badge>;
}

function getConnectionIcon(partner: {
  isActive: boolean;
  isDeleted: boolean;
  hasAccessToken: boolean;
}) {
  if (partner.isDeleted) {
    return <XCircle className="h-4 w-4 text-destructive" />;
  }
  if (!partner.hasAccessToken) {
    return <Clock className="h-4 w-4 text-yellow-500" />;
  }
  if (!partner.isActive) {
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
  return <CheckCircle className="h-4 w-4 text-green-500" />;
}

export default function AdminPartners() {
  const { partners } = useLoaderData<typeof loader>();

  const activeCount = partners.filter(
    (p) => p.isActive && !p.isDeleted && p.hasAccessToken
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Partner Stores</h1>
        <p className="text-muted-foreground">
          Manage connected supplier stores and their status
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Partners</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{partners.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Connections</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive/Deleted</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{partners.length - activeCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Partners Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Partners</CardTitle>
          <CardDescription>
            A list of all connected partner stores and their connection status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {partners.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No partner stores connected yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shop</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Connected</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((partner) => (
                  <TableRow key={partner.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {getConnectionIcon(partner)}
                        <span>{partner.shop}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(partner)}</TableCell>
                    <TableCell>{partner._count.productMappings}</TableCell>
                    <TableCell>{partner._count.partnerOrders}</TableCell>
                    <TableCell>{formatDate(partner.createdAt)}</TableCell>
                    <TableCell>{formatDate(partner.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
