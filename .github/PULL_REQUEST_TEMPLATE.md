## Description

Briefly describe the changes introduced by this pull request.

- Fixes #(issue)
- Implements RFC #(issue)

---

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance optimization
- [ ] Architecture / Code refactoring

---

## Testing Checklist

Run these in order: the typecheck and several test suites consume the built `@jantt/core`.

- [ ] Monorepo packages build cleanly (`npm run build`)
- [ ] Lint passes: TypeScript typecheck and CLI syntax (`npm run lint`)
- [ ] All unit and integration tests pass (`npm test`)
- [ ] Published package contents are valid (`npm run check:packages`)
- [ ] Added new unit tests covering the modified behavior
- [ ] No new runtime dependency added to `@jantt/core` (it ships with exactly one: `fflate`)

---

## Screenshots / Demos (If Applicable)

*(Attach screenshots or JSON snippets if visual UI or interaction changed)*
