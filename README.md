# Photo Compare Platform

A simple TypeScript web app for ranking a set of uploaded photos through human pairwise comparison.

The app is designed for cases where a human evaluator needs to decide which photo is more developed, better, or otherwise preferred. It keeps the workflow simple: upload photos, compare two at a time, and produce a final ordered ranking.

## Features

- Upload two or more photos from the browser.
- Compare one ranked photo against one new photo at a time.
- Choose one of three decisions:
  - Left ranked photo is better
  - New photo is better
  - Tie
- Maintain a ranked list using binary insertion ranking.
- Support tie groups, such as `A > B = C > D`.
- Show stored comparison history as JSON.
- Copy the JSON result for later analysis.
- Refresh the session to clear current ranking data.

## Ranking Logic

This project uses a binary insertion ranking algorithm.

After upload:

1. The first photo starts the ranked list.
2. Each remaining photo is inserted into the ranked list one at a time.
3. The left image is always a photo already in the ranked list.
4. The right image is always the new photo currently being inserted.
5. The app compares the new photo against the middle of the current search range.
6. Based on the human decision, the app narrows the search range until the correct position is found.
7. If the user chooses tie, the new photo is placed into the same rank group.

Example final ranking:

```text
A > B = C > D
```

This avoids comparing every photo with every other photo, which makes the workflow faster for larger photo sets.

## Run Locally

Install dependencies:

```bash
npm install
```

Build the TypeScript:

```bash
npm run build
```

Start a local static server:

```bash
python3 -m http.server 5173
```

Open the app:

```text
http://127.0.0.1:5173
```

Stop the server with `Ctrl+C`.

## Development

To rebuild TypeScript automatically while editing:

```bash
npm run dev
```

In another terminal, serve the project:

```bash
python3 -m http.server 5173
```

## Deployment

This is a static frontend-only website, so it can be deployed with GitHub Pages.

Recommended files to commit:

```text
index.html
src/
dist/
package.json
package-lock.json
tsconfig.json
.gitignore
README.md
```

Do not commit:

```text
node_modules/
```

On GitHub:

1. Open the repository settings.
2. Go to Pages.
3. Choose `Deploy from a branch`.
4. Select the `main` branch.
5. Select the root folder.
6. Save.

GitHub will provide a public URL for the app.

## Privacy Note

The app runs entirely in the browser. Uploaded photos are not sent to a server by this project. The current session data is stored in the browser using `localStorage`.

Refreshing the session from the app clears the current ranking data.
