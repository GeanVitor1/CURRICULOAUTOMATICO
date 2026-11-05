import minimums from "../shared/node-runtime-policy.json";
export function secureNodeVersion(version: string) {
  const parts = version.replace(/^v/, "").split(".").map(Number);
  const minimum = minimums[String(parts[0]) as keyof typeof minimums];
  return !!minimum && parts.length === 3 && parts.every(Number.isInteger) &&
    (parts[1] > minimum[1] || parts[1] === minimum[1] && parts[2] >= minimum[2]);
}
export function assertSecureNode(version = process.versions.node) {
  if (!secureNodeVersion(version)) throw Object.assign(new Error("Atualize o Node para 22.23.4+, 24.22.1+ ou 26.12.1+ antes de processar dados."), {code:"NODE_RUNTIME_UNSAFE",statusCode:503});
}
