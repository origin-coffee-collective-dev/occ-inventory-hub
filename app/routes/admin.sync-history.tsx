import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams, Link } from "react-router";
import { getSyncLogs, requireAdminSession, type SyncLogWithPartner } from "~/lib/supabase.server";
import { colors } from "~/lib/tokens";

interface LoaderData {
  logs: SyncLogWithPartner[];
  totalCount: number;
  page: number;
  pageSize: number;
  statusFilter: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminSession(request);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const statusFilter = url.searchParams.get("status") || "all";
  const pageSize = 25;

  const { data: logs, totalCount, error } = await getSyncLogs({
    page,
    pageSize,
    statusFilter: statusFilter as 'all' | 'completed' | 'failed' | 'started',
    syncType: 'inventory',
  });

  if (error) {
    console.error("Failed to fetch sync logs:", error);
  }

  return {
    logs,
    totalCount,
    page,
    pageSize,
    statusFilter,
  } satisfies LoaderData;
};

// Helper to format duration
function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "In progress";
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const diffMs = end - start;

  if (diffMs < 1000) return `${diffMs}ms`;
  if (diffMs < 60000) return `${(diffMs / 1000).toFixed(1)}s`;
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.round((diffMs % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// Helper to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Get status indicator styles
function getStatusStyles(status: string): {
  icon: string;
  color: string;
  bg: string;
  label: string;
} {
  switch (status) {
    case "completed":
      return { icon: "\u2713", color: colors.success.default, bg: colors.success.light, label: "Completed" };
    case "started":
      return { icon: "\u25CB", color: colors.info.default, bg: colors.info.light, label: "In Progress" };
    case "failed":
      return { icon: "\u2715", color: colors.error.default, bg: colors.error.light, label: "Failed" };
    default:
      return { icon: "\u2014", color: colors.text.muted, bg: colors.background.muted, label: status };
  }
}

export default function AdminSyncHistory() {
  const { logs, totalCount, page, pageSize, statusFilter } = useLoaderData<LoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const totalPages = Math.ceil(totalCount / pageSize);

  const handleStatusFilterChange = (newFilter: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("status", newFilter);
    params.set("page", "1"); // Reset to first page on filter change
    setSearchParams(params);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(newPage));
    setSearchParams(params);
  };

  const toggleRow = (logId: string) => {
    setExpandedRow(expandedRow === logId ? null : logId);
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/admin/inventory-sync" style={{ color: colors.interactive.link, textDecoration: "none", fontSize: "0.875rem" }}>
          &larr; Back to Inventory Sync
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          Sync History
        </h1>
        <div style={{ fontSize: "0.875rem", color: colors.text.muted }}>
          {totalCount} total sync{totalCount !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: colors.background.card,
        padding: "1rem",
        borderRadius: "8px",
        marginBottom: "1rem",
        display: "flex",
        gap: "0.5rem",
      }}>
        <span style={{ fontSize: "0.875rem", fontWeight: 500, alignSelf: "center", marginRight: "0.5rem" }}>
          Filter by status:
        </span>
        {["all", "completed", "failed", "started"].map((filter) => (
          <button
            key={filter}
            onClick={() => handleStatusFilterChange(filter)}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: statusFilter === filter ? colors.primary.default : colors.background.muted,
              color: statusFilter === filter ? colors.text.inverse : colors.text.secondary,
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
              textTransform: "capitalize",
            }}
          >
            {filter === "all" ? "All" : filter === "started" ? "In Progress" : filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {/* Logs Table */}
      <div style={{
        backgroundColor: colors.background.card,
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        overflow: "hidden",
      }}>
        {logs.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: colors.text.muted }}>
            No sync logs found{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border.default}`, backgroundColor: colors.background.subtle }}>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: colors.text.muted, textTransform: "uppercase" }}>
                  Started At
                </th>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: colors.text.muted, textTransform: "uppercase" }}>
                  Partner
                </th>
                <th style={{ textAlign: "center", padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: colors.text.muted, textTransform: "uppercase" }}>
                  Status
                </th>
                <th style={{ textAlign: "right", padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: colors.text.muted, textTransform: "uppercase" }}>
                  Processed
                </th>
                <th style={{ textAlign: "right", padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: colors.text.muted, textTransform: "uppercase" }}>
                  Updated
                </th>
                <th style={{ textAlign: "right", padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: colors.text.muted, textTransform: "uppercase" }}>
                  Failed
                </th>
                <th style={{ textAlign: "right", padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: colors.text.muted, textTransform: "uppercase" }}>
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const statusStyles = getStatusStyles(log.status);
                const hasError = log.error_message && log.error_message.length > 0;
                const isExpanded = expandedRow === log.id;
                const partnerName = log.partners?.shop?.replace(".myshopify.com", "") || "—";

                return (
                  <>
                    <tr
                      key={log.id}
                      onClick={() => hasError && toggleRow(log.id)}
                      style={{
                        borderBottom: `1px solid ${colors.border.default}`,
                        cursor: hasError ? "pointer" : "default",
                        backgroundColor: isExpanded ? colors.background.subtle : "transparent",
                      }}
                    >
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                          {new Date(log.started_at).toLocaleString()}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: colors.text.muted }}>
                          {formatRelativeTime(log.started_at)}
                        </div>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}>
                        {log.partners?.shop ? (
                          <Link
                            to={`/admin/partners/${partnerName}`}
                            style={{ color: colors.interactive.link, textDecoration: "none" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {partnerName}
                          </Link>
                        ) : (
                          <span style={{ color: colors.text.muted }}>{partnerName}</span>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.375rem",
                            padding: "0.25rem 0.75rem",
                            borderRadius: "9999px",
                            backgroundColor: statusStyles.bg,
                            color: statusStyles.color,
                            fontSize: "0.75rem",
                            fontWeight: 500,
                          }}
                        >
                          {statusStyles.icon} {statusStyles.label}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontSize: "0.875rem" }}>
                        {log.items_processed}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontSize: "0.875rem", color: log.items_updated > 0 ? colors.success.default : colors.text.muted }}>
                        {log.items_updated}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontSize: "0.875rem", color: log.items_failed > 0 ? colors.error.default : colors.text.muted }}>
                        {log.items_failed > 0 ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                            {log.items_failed}
                            {hasError && (
                              <span style={{ fontSize: "0.75rem" }}>{isExpanded ? "\u25B2" : "\u25BC"}</span>
                            )}
                          </span>
                        ) : (
                          log.items_failed
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontSize: "0.875rem", color: colors.text.muted }}>
                        {formatDuration(log.started_at, log.completed_at)}
                      </td>
                    </tr>
                    {/* Expanded error details row */}
                    {isExpanded && hasError && (
                      <tr key={`${log.id}-details`}>
                        <td
                          colSpan={7}
                          style={{
                            padding: "1rem",
                            backgroundColor: colors.error.light,
                            borderBottom: `1px solid ${colors.border.default}`,
                          }}
                        >
                          <div style={{ fontWeight: 500, marginBottom: "0.5rem", color: colors.error.textDark }}>
                            Error Details
                          </div>
                          <div style={{
                            fontSize: "0.875rem",
                            color: colors.error.textDark,
                            whiteSpace: "pre-wrap",
                            fontFamily: "monospace",
                            backgroundColor: "white",
                            padding: "0.75rem",
                            borderRadius: "4px",
                            border: `1px solid ${colors.error.border}`,
                            maxHeight: "200px",
                            overflow: "auto",
                          }}>
                            {log.error_message}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem",
            borderTop: `1px solid ${colors.border.default}`,
            backgroundColor: colors.background.subtle,
          }}>
            <div style={{ fontSize: "0.875rem", color: colors.text.muted }}>
              Page {page} of {totalPages}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: page === 1 ? colors.background.muted : colors.background.card,
                  color: page === 1 ? colors.text.disabled : colors.text.secondary,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: "4px",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                }}
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: page === totalPages ? colors.background.muted : colors.background.card,
                  color: page === totalPages ? colors.text.disabled : colors.text.secondary,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: "4px",
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
