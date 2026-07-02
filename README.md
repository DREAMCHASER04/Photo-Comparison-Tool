# Photo Compare Platform

A simple TypeScript web app for ranking parsed photo groups through human pairwise comparison.

The app is designed for phenology photo ranking where a human evaluator decides which photo is more developed. It keeps filenames hidden during comparison, but includes filenames in the exported CSV for analysis.

## Features

- Upload a local folder, including Google Drive folders synced to the computer.
- Parse images from `cropped` folders using names like `01A_03192026_cropped.jpg`.
- Automatically create multiple grouping modes from wood folder, tree number, branch letter, and date.
- Choose a grouping mode first, then choose one anonymous group within that mode.
- Create a custom test set by selecting anonymous photo thumbnails.
- Compare one ranked photo against one new photo at a time.
- Choose one of three decisions:
  - Left ranked photo is better
  - New photo is better
  - Tie
- Maintain a ranked list using binary insertion ranking.
- Support tie groups, such as `A > B = C > D`.
- Hide filenames in the comparison and ranking interface.
- Adjust the finished ranking manually by selecting a photo and inserting it before, after, or into a tie group.
- Download the current ranking board as CSV only when the `Download CSV` button is clicked.
- Refresh the session to clear current ranking data.

## Expected Folder and Filename Format

For folder upload, the app only ranks image files under a folder named `cropped`.

Recommended structure:

```text
Wood Name/
  cropped/
    01A_03192026_cropped.jpg
    01A_04022026_cropped.jpg
    01B_03192026_cropped.jpg
```

Filename parsing:

- `01` is the tree number.
- `A` is the branch.
- `03192026` is the date, parsed as `2026-03-19`.
- `_cropped` marks the image as the cropped version.

The app generates multiple grouping views, including:

```text
Same branch across dates
Same day across branches
Same day across trees
Same tree across dates
Same date all trees and branches
All parsed photos together
```

The interface uses two levels:

```text
Grouping mode -> Anonymous group
```

The group dropdown shows anonymous group numbers, such as `Group 1 (4 photos)`, so specific wood/tree/branch/date values are not visible during ranking. The custom test set mode also uses only anonymous thumbnails such as `Uploaded Photo 1`. Parsed details are included only in the CSV export.

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
8. After the final insertion, the evaluator can adjust the ranking board and download CSV manually.

Example final ranking:

```text
A > B = C > D
```

This avoids comparing every photo with every other photo, which makes the workflow faster for larger photo sets. After automatic ranking, the evaluator can still select a thumbnail in the ranking list and place it before, after, or tied with another ranked group.

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
