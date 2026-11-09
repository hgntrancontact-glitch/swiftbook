# Swiftbook workflow

- The user has authorized pushing fixes after implementation. Run the relevant tests and TypeScript checks before publishing.
- `main` stores source code. GitHub Pages serves the separate `gh-pages` branch; pushing `main` alone does not update the public app.
- After committing reviewed fixes on `main`, run `npm run deploy`. It builds the committed source, pushes `main`, and publishes static files to `gh-pages` while retaining deployment history.
- Verify the public `https://hgntrancontact-glitch.github.io/swiftbook/build-info.json` matches the source commit before reporting the app as published. A `?v=` query parameter is not proof of deployment.
- Tests: `npm test`. TypeScript: `npm run lint`.
