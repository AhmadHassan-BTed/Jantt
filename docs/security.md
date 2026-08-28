# Security Model & Threat Assessment

Jantt is designed with a defense-in-depth security model to ensure safe parsing, rendering, and manipulation of timeline data across browser and server environments.

---

## 🛡️ Core Security Architecture

### 1. Declarative Data Sandbox (Zero Script Execution)
Jantt treats all inputs strictly as declarative JSON state.
- No `eval()` or `Function()` constructor invocations exist in any package.
- No script tags or executable event handlers are parsed or executed.
- Custom field payloads (`fields`) are treated as opaque key-value data.

### 2. Aggressive DOM Sanitization
All user-controlled strings (task titles, notes, category names, custom field values) pass through standard HTML escaping before DOM insertion:

```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

### 3. Supply Chain Security (Zero Core Runtime Dependencies)
`@jantt/core` has **0 runtime dependencies**. This eliminates:
- Malicious package takeovers in transitive dependency trees.
- Prototype pollution from third-party object utilities.
- Version drift vulnerabilities.

### 4. Input Validation & Denial-of-Service (DoS) Protection
- **Cyclic Graph Protection**: Cyclic dependencies (`A -> B -> A`) are detected in constant memory and prevented from locking the iterative relaxation loop with `MAX_PASSES` caps.
- **Date Range Bounds**: Validates date formats against strict ISO-8601 regex and calendar logic to prevent `NaN` date math overflow.
- **Memory Footprint**: Pure virtual layout algorithms maintain $O(N)$ space complexity.
