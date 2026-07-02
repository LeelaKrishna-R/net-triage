import { z } from "zod";

export const ISSUE_CATEGORIES = [
  "ospf_adjacency_failure",
  "bgp_neighbor_down",
  "vlan_trunk_misconfig",
  "stp_loop",
  "acl_blocking_traffic",
  "nat_translation_failure",
  "mtu_mismatch",
  "duplex_speed_mismatch",
  "dhcp_pool_exhaustion",
  "port_security_violation",
] as const;

export const DiagnosisSchema = z.object({
  issue_category: z.enum(ISSUE_CATEGORIES),
  severity: z.enum(["low", "medium", "high", "critical"]),
  root_cause: z.string(),
  evidence: z.array(z.string()),
  suggested_fix: z.string(),
  confidence: z.number().min(0).max(1),
});

export type Diagnosis = z.infer<typeof DiagnosisSchema>;
