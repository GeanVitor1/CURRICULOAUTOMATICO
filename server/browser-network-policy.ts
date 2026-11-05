import type { NetworkPolicy } from "@vercel/sandbox";

// The current Vercel API rejects IPv6 CIDRs (HTTP 400). Enforce dual-stack
// private-address checks in browser-egress; use supported IPv4 CIDRs here.
export const PRIVATE_NETWORKS = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
  "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
  "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24",
  "224.0.0.0/4", "240.0.0.0/4",
];
export function browserNetworkPolicy(hosts: string[] = ["*"]): NetworkPolicy {
  return { allow: hosts, subnets: { deny: [...PRIVATE_NETWORKS] } };
}
