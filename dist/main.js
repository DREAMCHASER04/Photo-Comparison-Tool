"use strict";
const STORAGE_KEY = "photo-compare-platform-state";
const emptyState = () => ({
    photos: [],
    rankingGroups: [],
    pendingPhotoIndex: 0,
    activeSearch: null,
    comparisons: [],
    completed: false,
});
let state = loadState();
const elements = {
    input: queryRequired("#photoInput"),
    resetButton: queryRequired("#resetButton"),
    leftButton: queryRequired("#leftButton"),
    rightButton: queryRequired("#rightButton"),
    tieButton: queryRequired("#tieButton"),
    copyButton: queryRequired("#copyButton"),
    leftImage: queryRequired("#leftImage"),
    rightImage: queryRequired("#rightImage"),
    leftPlaceholder: queryRequired("#leftPlaceholder"),
    rightPlaceholder: queryRequired("#rightPlaceholder"),
    leftName: queryRequired("#leftName"),
    rightName: queryRequired("#rightName"),
    pairLabel: queryRequired("#pairLabel"),
    photoCount: queryRequired("#photoCount"),
    comparisonCount: queryRequired("#comparisonCount"),
    remainingCount: queryRequired("#remainingCount"),
    rankingList: queryRequired("#rankingList"),
    historyOutput: queryRequired("#historyOutput"),
};
normalizeState();
bindEvents();
render();
function queryRequired(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Missing required element: ${selector}`);
    }
    return element;
}
function bindEvents() {
    elements.input.addEventListener("change", async () => {
        const files = Array.from(elements.input.files ?? []);
        if (files.length === 0)
            return;
        const photos = await Promise.all(files.map(readPhoto));
        state = startRankingSession(photos);
        render();
        persist();
    });
    elements.leftButton.addEventListener("click", () => recordDecision("left"));
    elements.rightButton.addEventListener("click", () => recordDecision("right"));
    elements.tieButton.addEventListener("click", () => recordDecision("tie"));
    elements.resetButton.addEventListener("click", () => {
        state = emptyState();
        elements.input.value = "";
        localStorage.removeItem(STORAGE_KEY);
        render();
    });
    elements.copyButton.addEventListener("click", async () => {
        await navigator.clipboard.writeText(JSON.stringify(createExportData(), null, 2));
        elements.copyButton.textContent = "Copied";
        window.setTimeout(() => {
            elements.copyButton.textContent = "Copy JSON";
        }, 1200);
    });
}
function startRankingSession(photos) {
    const nextState = {
        photos,
        rankingGroups: photos[0] ? [{ id: createId(), photoIds: [photos[0].id] }] : [],
        pendingPhotoIndex: photos.length > 1 ? 1 : photos.length,
        activeSearch: null,
        comparisons: [],
        completed: photos.length <= 1,
    };
    return advanceToNextComparison(nextState);
}
function readPhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            resolve({
                id: createId(),
                name: file.name,
                dataUrl: String(reader.result),
            });
        });
        reader.addEventListener("error", () => reject(reader.error));
        reader.readAsDataURL(file);
    });
}
function advanceToNextComparison(nextState = state) {
    while (nextState.pendingPhotoIndex < nextState.photos.length) {
        const newPhoto = nextState.photos[nextState.pendingPhotoIndex];
        if (nextState.rankingGroups.length === 0) {
            nextState.rankingGroups.push({ id: createId(), photoIds: [newPhoto.id] });
            nextState.pendingPhotoIndex += 1;
            continue;
        }
        nextState.activeSearch = createSearch(newPhoto.id, 0, nextState.rankingGroups.length);
        nextState.completed = false;
        return nextState;
    }
    nextState.activeSearch = null;
    nextState.completed = nextState.photos.length > 0;
    return nextState;
}
function createSearch(newPhotoId, low, high) {
    return {
        newPhotoId,
        low,
        high,
        mid: Math.floor((low + high) / 2),
    };
}
function recordDecision(result) {
    const pair = getCurrentPair();
    const search = state.activeSearch;
    if (!pair || !search)
        return;
    const [existingPhoto, newPhoto] = pair;
    state.comparisons.push({
        id: createId(),
        timestamp: new Date().toISOString(),
        existingPhotoId: existingPhoto.id,
        newPhotoId: newPhoto.id,
        result,
        relation: result === "tie" ? "equal" : result === "left" ? "existing_more_developed" : "new_more_developed",
        insertionStep: {
            low: search.low,
            high: search.high,
            mid: search.mid,
        },
    });
    if (result === "tie") {
        state.rankingGroups[search.mid].photoIds.push(newPhoto.id);
        finishCurrentInsertion();
    }
    else {
        const nextLow = result === "left" ? search.mid + 1 : search.low;
        const nextHigh = result === "right" ? search.mid : search.high;
        if (nextLow >= nextHigh) {
            state.rankingGroups.splice(nextLow, 0, { id: createId(), photoIds: [newPhoto.id] });
            finishCurrentInsertion();
        }
        else {
            state.activeSearch = createSearch(newPhoto.id, nextLow, nextHigh);
        }
    }
    persist();
    render();
}
function finishCurrentInsertion() {
    state.pendingPhotoIndex += 1;
    state.activeSearch = null;
    advanceToNextComparison();
}
function getCurrentPair() {
    const search = state.activeSearch;
    if (!search)
        return null;
    const existingPhotoId = state.rankingGroups[search.mid]?.photoIds[0];
    const existingPhoto = existingPhotoId ? findPhoto(existingPhotoId) : null;
    const newPhoto = findPhoto(search.newPhotoId);
    if (!existingPhoto || !newPhoto)
        return null;
    return [existingPhoto, newPhoto];
}
function render() {
    const pair = getCurrentPair();
    const leftPhoto = pair?.[0] ?? state.photos[0] ?? null;
    const rightPhoto = pair?.[1] ?? getActiveNewPhoto();
    const remaining = getRemainingPhotos();
    renderPhoto("left", leftPhoto);
    renderPhoto("right", rightPhoto);
    elements.photoCount.textContent = String(state.photos.length);
    elements.comparisonCount.textContent = String(state.comparisons.length);
    elements.remainingCount.textContent = String(remaining);
    const hasPair = Boolean(pair);
    elements.leftButton.disabled = !hasPair;
    elements.rightButton.disabled = !hasPair;
    elements.tieButton.disabled = !hasPair;
    elements.leftButton.textContent = "Left";
    elements.rightButton.textContent = "Right";
    if (pair && state.activeSearch) {
        const activePosition = state.pendingPhotoIndex + 1;
        elements.pairLabel.textContent =
            `Insert photo ${activePosition} of ${state.photos.length}. ` +
                `Compare against ranked position ${state.activeSearch.mid + 1}.`;
    }
    else if (state.photos.length === 0) {
        elements.pairLabel.textContent = "Upload images to begin.";
    }
    else if (state.photos.length === 1) {
        elements.pairLabel.textContent = "One photo loaded. Upload at least two photos to compare.";
    }
    else if (state.completed) {
        elements.pairLabel.textContent = "Ranking complete. No more photos need to be compared.";
    }
    else {
        elements.pairLabel.textContent = "Preparing the next comparison.";
    }
    renderRanking();
    elements.historyOutput.textContent = JSON.stringify(createExportData(), null, 2);
}
function renderPhoto(side, photo) {
    const image = side === "left" ? elements.leftImage : elements.rightImage;
    const placeholder = side === "left" ? elements.leftPlaceholder : elements.rightPlaceholder;
    const name = side === "left" ? elements.leftName : elements.rightName;
    if (!photo) {
        image.removeAttribute("src");
        image.style.display = "none";
        placeholder.style.display = "block";
        name.textContent = side === "left" ? "No ranked photo" : "No new photo";
        return;
    }
    image.src = photo.dataUrl;
    image.style.display = "block";
    placeholder.style.display = "none";
    name.textContent = photo.name;
}
function renderRanking() {
    elements.rankingList.replaceChildren();
    if (state.rankingGroups.length === 0) {
        const item = document.createElement("li");
        item.textContent = "No ranking data yet.";
        elements.rankingList.append(item);
        return;
    }
    state.rankingGroups.forEach((group, index) => {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        const meta = document.createElement("span");
        const names = group.photoIds.map((photoId) => findPhoto(photoId)?.name ?? "Missing photo");
        title.textContent = names.join(" = ");
        meta.textContent = group.photoIds.length > 1 ? `rank ${index + 1} | tie group` : `rank ${index + 1}`;
        item.append(title, meta);
        elements.rankingList.append(item);
    });
}
function createExportData() {
    return {
        session: {
            algorithm: "binary_insertion_ranking",
            photoCount: state.photos.length,
            comparisonCount: state.comparisons.length,
            remainingPhotosToInsert: getRemainingPhotos(),
            completed: state.completed,
            updatedAt: new Date().toISOString(),
        },
        photos: state.photos.map(({ id, name }) => ({ id, name })),
        comparisons: state.comparisons,
        ranking: state.rankingGroups.map((group, index) => ({
            rank: index + 1,
            relation: group.photoIds.length > 1 ? "equal" : "single",
            photoIds: group.photoIds,
            names: group.photoIds.map((photoId) => findPhoto(photoId)?.name ?? "Missing photo"),
        })),
        rankTree: state.rankingGroups.map((group, index) => ({
            rank: index + 1,
            equalPhotoIds: group.photoIds,
            betterThanGroupIds: state.rankingGroups.slice(index + 1).map((lowerGroup) => lowerGroup.id),
            worseThanGroupIds: state.rankingGroups.slice(0, index).map((higherGroup) => higherGroup.id),
        })),
    };
}
function getActiveNewPhoto() {
    if (state.pendingPhotoIndex >= state.photos.length)
        return null;
    return state.photos[state.pendingPhotoIndex] ?? null;
}
function getRemainingPhotos() {
    if (state.photos.length === 0)
        return 0;
    return Math.max(state.photos.length - state.pendingPhotoIndex, 0);
}
function findPhoto(id) {
    return state.photos.find((photo) => photo.id === id) ?? null;
}
function persist() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch (error) {
        console.warn("Session was not saved locally, probably because uploaded images are too large.", error);
    }
}
function loadState() {
    const rawState = localStorage.getItem(STORAGE_KEY);
    if (!rawState)
        return emptyState();
    try {
        const parsed = JSON.parse(rawState);
        if (!Array.isArray(parsed.photos))
            return emptyState();
        return {
            photos: parsed.photos,
            rankingGroups: Array.isArray(parsed.rankingGroups) ? parsed.rankingGroups : [],
            pendingPhotoIndex: typeof parsed.pendingPhotoIndex === "number" ? parsed.pendingPhotoIndex : 0,
            activeSearch: parsed.activeSearch ?? null,
            comparisons: Array.isArray(parsed.comparisons) ? parsed.comparisons : [],
            completed: Boolean(parsed.completed),
        };
    }
    catch {
        return emptyState();
    }
}
function normalizeState() {
    if (state.photos.length === 0) {
        state = emptyState();
        return;
    }
    if (state.rankingGroups.length === 0) {
        state = startRankingSession(state.photos);
    }
}
function createId() {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
