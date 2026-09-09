# Project guidelines

Use plain, direct language. Avoid mannered prose.

This project is in active development. Prefer breaking changes that simplify the
architecture over backward compatibility. Remove obsolete code, schemas, and data
instead of keeping compatibility layers.

When asked to run tests, read [TESTS.md](TESTS.md) before starting and follow its
testing conventions.

Mobile is the primary layout. Use unprefixed Tailwind classes for mobile defaults,
then add larger breakpoints. During play, fit the table, hand, and actions within
the dynamic viewport. Reuse the existing Radix/shadcn components for standard
controls instead of adding custom versions.
