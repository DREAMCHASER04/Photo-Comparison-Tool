type PhotoMetadata = {
  woodName: string;
  treeId: string;
  branchId: string;
  dateRaw: string;
  dateIso: string;
  sourcePath: string;
  parsed: boolean;
};

type PhotoItem = {
  id: string;
  name: string;
  dataUrl: string;
  metadata: PhotoMetadata;
};

type ComparisonResult = "left" | "right" | "tie";

type ComparisonRecord = {
  id: string;
  timestamp: string;
  existingPhotoId: string;
  newPhotoId: string;
  result: ComparisonResult;
  relation: "existing_more_developed" | "new_more_developed" | "equal";
  insertionStep: {
    low: number;
    high: number;
    mid: number;
  };
};

type RankingGroup = {
  id: string;
  photoIds: string[];
};

type ParsedCategory = {
  key: string;
  modeId: string;
  modeLabel: string;
  groupKey: string;
  label: string;
  exportLabel: string;
  photoIds: string[];
};

type GroupingMode = {
  id: string;
  label: string;
  createGroupKey: (photo: PhotoItem) => string;
  createExportLabel: (photo: PhotoItem) => string;
};

type InsertionSearch = {
  newPhotoId: string;
  low: number;
  high: number;
  mid: number;
};

type AppState = {
  uploadedPhotos: PhotoItem[];
  anonymousPhotoOrder: string[];
  categories: ParsedCategory[];
  selectedModeId: string;
  selectedCategoryKey: string;
  customPhotoIds: string[];
  photos: PhotoItem[];
  rankingGroups: RankingGroup[];
  pendingPhotoIndex: number;
  activeSearch: InsertionSearch | null;
  comparisons: ComparisonRecord[];
  completed: boolean;
  selectedPhotoId: string | null;
};

const STORAGE_KEY = "photo-compare-platform-state-v2";
const CUSTOM_MODE_ID = "custom";

const emptyState = (): AppState => ({
  uploadedPhotos: [],
  anonymousPhotoOrder: [],
  categories: [],
  selectedModeId: "",
  selectedCategoryKey: "",
  customPhotoIds: [],
  photos: [],
  rankingGroups: [],
  pendingPhotoIndex: 0,
  activeSearch: null,
  comparisons: [],
  completed: false,
  selectedPhotoId: null,
});

const GROUPING_MODES: GroupingMode[] = [
  {
    id: "same-branch-different-days",
    label: "Same branch across dates",
    createGroupKey: (photo) => [photo.metadata.woodName, photo.metadata.treeId, photo.metadata.branchId].join("::"),
    createExportLabel: (photo) =>
      `${photo.metadata.woodName} / tree ${photo.metadata.treeId} / branch ${photo.metadata.branchId}`,
  },
  {
    id: "same-day-different-branches",
    label: "Same day across branches",
    createGroupKey: (photo) => [photo.metadata.woodName, photo.metadata.treeId, photo.metadata.dateRaw].join("::"),
    createExportLabel: (photo) =>
      `${photo.metadata.woodName} / tree ${photo.metadata.treeId} / date ${photo.metadata.dateIso}`,
  },
  {
    id: "same-day-different-trees",
    label: "Same day across trees",
    createGroupKey: (photo) => [photo.metadata.woodName, photo.metadata.branchId, photo.metadata.dateRaw].join("::"),
    createExportLabel: (photo) =>
      `${photo.metadata.woodName} / branch ${photo.metadata.branchId} / date ${photo.metadata.dateIso}`,
  },
  {
    id: "same-tree-different-days",
    label: "Same tree across dates",
    createGroupKey: (photo) => [photo.metadata.woodName, photo.metadata.treeId].join("::"),
    createExportLabel: (photo) => `${photo.metadata.woodName} / tree ${photo.metadata.treeId}`,
  },
  {
    id: "same-date-all-photos",
    label: "Same date all trees and branches",
    createGroupKey: (photo) => [photo.metadata.woodName, photo.metadata.dateRaw].join("::"),
    createExportLabel: (photo) => `${photo.metadata.woodName} / date ${photo.metadata.dateIso}`,
  },
  {
    id: "all-parsed-photos",
    label: "All parsed photos together",
    createGroupKey: (photo) => photo.metadata.woodName,
    createExportLabel: (photo) => photo.metadata.woodName,
  },
];

let state: AppState = loadState();

const elements = {
  input: queryRequired<HTMLInputElement>("#photoInput"),
  modeSelect: queryRequired<HTMLSelectElement>("#modeSelect"),
  groupSelect: queryRequired<HTMLSelectElement>("#groupSelect"),
  customPanel: queryRequired<HTMLElement>("#customPanel"),
  customPhotoGrid: queryRequired<HTMLElement>("#customPhotoGrid"),
  startCustomButton: queryRequired<HTMLButtonElement>("#startCustomButton"),
  resetButton: queryRequired<HTMLButtonElement>("#resetButton"),
  leftButton: queryRequired<HTMLButtonElement>("#leftButton"),
  rightButton: queryRequired<HTMLButtonElement>("#rightButton"),
  tieButton: queryRequired<HTMLButtonElement>("#tieButton"),
  exportButton: queryRequired<HTMLButtonElement>("#exportButton"),
  leftImage: queryRequired<HTMLImageElement>("#leftImage"),
  rightImage: queryRequired<HTMLImageElement>("#rightImage"),
  leftPlaceholder: queryRequired<HTMLSpanElement>("#leftPlaceholder"),
  rightPlaceholder: queryRequired<HTMLSpanElement>("#rightPlaceholder"),
  leftName: queryRequired<HTMLElement>("#leftName"),
  rightName: queryRequired<HTMLElement>("#rightName"),
  pairLabel: queryRequired<HTMLElement>("#pairLabel"),
  photoCount: queryRequired<HTMLElement>("#photoCount"),
  comparisonCount: queryRequired<HTMLElement>("#comparisonCount"),
  remainingCount: queryRequired<HTMLElement>("#remainingCount"),
  rankingList: queryRequired<HTMLOListElement>("#rankingList"),
  historyOutput: queryRequired<HTMLElement>("#historyOutput"),
};

normalizeState();
bindEvents();
render();

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function bindEvents(): void {
  elements.input.addEventListener("change", async () => {
    const files = selectSupportedFiles(Array.from(elements.input.files ?? []));
    if (files.length === 0) return;

    const uploadedPhotos = await Promise.all(files.map(readPhoto));
    const categories = buildCategories(uploadedPhotos);
    const selectedModeId = categories[0]?.modeId ?? "";
    const selectedCategoryKey = categories.find((category) => category.modeId === selectedModeId)?.key ?? "";

    state = {
      ...emptyState(),
      uploadedPhotos,
      anonymousPhotoOrder: randomizePhotoOrder(uploadedPhotos).map((photo) => photo.id),
      categories,
      selectedModeId,
      selectedCategoryKey,
    };
    startSelectedCategorySession();
    persist();
    render();
  });

  elements.modeSelect.addEventListener("change", () => {
    state.selectedModeId = elements.modeSelect.value;
    state.selectedCategoryKey = getCategoriesForSelectedMode()[0]?.key ?? "";
    startSelectedCategorySession();
    persist();
    render();
  });

  elements.groupSelect.addEventListener("change", () => {
    state.selectedCategoryKey = elements.groupSelect.value;
    startSelectedCategorySession();
    persist();
    render();
  });

  elements.customPhotoGrid.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-photo-id]");
    if (!button) return;

    const photoId = button.dataset.photoId;
    if (!photoId) return;

    state.customPhotoIds = state.customPhotoIds.includes(photoId)
      ? state.customPhotoIds.filter((item) => item !== photoId)
      : [...state.customPhotoIds, photoId];
    persist();
    render();
  });

  elements.startCustomButton.addEventListener("click", () => {
    startCustomSession();
    persist();
    render();
  });

  elements.leftButton.addEventListener("click", () => recordDecision("left"));
  elements.rightButton.addEventListener("click", () => recordDecision("right"));
  elements.tieButton.addEventListener("click", () => recordDecision("tie"));

  elements.rankingList.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const photoId = button.dataset.photoId;
    const groupId = button.dataset.groupId;

    if (action === "select" && photoId) {
      state.selectedPhotoId = state.selectedPhotoId === photoId ? null : photoId;
      persist();
      render();
      return;
    }

    if (state.selectedPhotoId && groupId) {
      if (action === "before") moveSelectedPhoto(groupId, "before");
      if (action === "after") moveSelectedPhoto(groupId, "after");
      if (action === "tie") moveSelectedPhoto(groupId, "tie");
    }
  });

  elements.resetButton.addEventListener("click", () => {
    state = emptyState();
    elements.input.value = "";
    localStorage.removeItem(STORAGE_KEY);
    render();
  });

  elements.exportButton.addEventListener("click", () => {
    downloadRankingCsv();
  });
}

function selectSupportedFiles(files: File[]): File[] {
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  const hasDirectoryPaths = imageFiles.some((file) => getFilePath(file).includes("/"));
  if (!hasDirectoryPaths) return imageFiles;

  return imageFiles.filter((file) =>
    getPathParts(file).some((part) => part.toLowerCase() === "cropped"),
  );
}

function getCategoriesForSelectedMode(): ParsedCategory[] {
  return state.categories.filter((category) => category.modeId === state.selectedModeId);
}

function startSelectedCategorySession(): void {
  if (state.selectedModeId === CUSTOM_MODE_ID) {
    startCustomSession();
    return;
  }

  const category = state.categories.find((item) => item.key === state.selectedCategoryKey);
  const photos = category
    ? category.photoIds
        .map((photoId) => state.uploadedPhotos.find((photo) => photo.id === photoId))
        .filter((photo): photo is PhotoItem => Boolean(photo))
    : [];

  const nextState = startRankingSession(randomizePhotoOrder(photos));
  state = {
    ...state,
    photos: nextState.photos,
    rankingGroups: nextState.rankingGroups,
    pendingPhotoIndex: nextState.pendingPhotoIndex,
    activeSearch: nextState.activeSearch,
    comparisons: [],
    completed: nextState.completed,
    selectedPhotoId: null,
  };
}

function startCustomSession(): void {
  const photos = state.customPhotoIds
    .map((photoId) => state.uploadedPhotos.find((photo) => photo.id === photoId))
    .filter((photo): photo is PhotoItem => Boolean(photo));
  const nextState = startRankingSession(randomizePhotoOrder(photos));

  state = {
    ...state,
    selectedModeId: CUSTOM_MODE_ID,
    selectedCategoryKey: "",
    photos: nextState.photos,
    rankingGroups: nextState.rankingGroups,
    pendingPhotoIndex: nextState.pendingPhotoIndex,
    activeSearch: nextState.activeSearch,
    comparisons: [],
    completed: nextState.completed,
    selectedPhotoId: null,
  };
}

function startRankingSession(photos: PhotoItem[]): Pick<
  AppState,
  "photos" | "rankingGroups" | "pendingPhotoIndex" | "activeSearch" | "completed"
> {
  const nextState = {
    photos,
    rankingGroups: photos[0] ? [{ id: createId(), photoIds: [photos[0].id] }] : [],
    pendingPhotoIndex: photos.length > 1 ? 1 : photos.length,
    activeSearch: null,
    completed: photos.length <= 1 && photos.length > 0,
  };

  return advanceToNextComparison(nextState);
}

function readPhoto(file: File): Promise<PhotoItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve({
        id: createId(),
        name: file.name,
        dataUrl: String(reader.result),
        metadata: parsePhotoMetadata(file),
      });
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function parsePhotoMetadata(file: File): PhotoMetadata {
  const sourcePath = getFilePath(file);
  const parts = getPathParts(file);
  const croppedIndex = parts.findIndex((part) => part.toLowerCase() === "cropped");
  const woodName = croppedIndex > 0 ? parts[croppedIndex - 1] : "Uploaded photos";
  const match = file.name.match(/^(\d+)([a-z]+)_(\d{8})_cropped\.(jpe?g|png|webp|gif|bmp|tiff?)$/i);

  if (!match) {
    return {
      woodName,
      treeId: "unparsed",
      branchId: "unparsed",
      dateRaw: "",
      dateIso: "",
      sourcePath,
      parsed: false,
    };
  }

  const [, treeId, branchId, dateRaw] = match;
  return {
    woodName,
    treeId,
    branchId: branchId.toUpperCase(),
    dateRaw,
    dateIso: formatDate(dateRaw),
    sourcePath,
    parsed: true,
  };
}

function buildCategories(photos: PhotoItem[]): ParsedCategory[] {
  const categories = new Map<string, ParsedCategory>();
  const parsedPhotos = photos.filter((photo) => photo.metadata.parsed);
  const unparsedPhotos = photos.filter((photo) => !photo.metadata.parsed);

  GROUPING_MODES.forEach((mode) => {
    parsedPhotos.forEach((photo) => {
      const groupKey = mode.createGroupKey(photo);
      const key = `${mode.id}::${groupKey}`;
      const category = categories.get(key) ?? {
        key,
        modeId: mode.id,
        modeLabel: mode.label,
        groupKey,
        label: "",
        exportLabel: mode.createExportLabel(photo),
        photoIds: [],
      };
      category.photoIds.push(photo.id);
      categories.set(key, category);
    });
  });

  if (unparsedPhotos.length > 0) {
    categories.set("unparsed::all", {
      key: "unparsed::all",
      modeId: "unparsed",
      modeLabel: "Unparsed uploaded photos",
      groupKey: "all",
      label: "",
      exportLabel: "Unparsed uploaded photos",
      photoIds: unparsedPhotos.map((photo) => photo.id),
    });
  }

  const modeCounters = new Map<string, number>();
  return Array.from(categories.values())
    .filter((category) => category.photoIds.length > 0)
    .sort((a, b) =>
      a.modeLabel.localeCompare(b.modeLabel, undefined, { numeric: true }) ||
      a.exportLabel.localeCompare(b.exportLabel, undefined, { numeric: true }),
    )
    .map((category) => {
      const nextIndex = (modeCounters.get(category.modeId) ?? 0) + 1;
      modeCounters.set(category.modeId, nextIndex);
      return {
        ...category,
        label: `${category.modeLabel} - Group ${nextIndex} (${category.photoIds.length} photos)`,
      };
    });
}

function advanceToNextComparison<T extends Pick<
  AppState,
  "photos" | "rankingGroups" | "pendingPhotoIndex" | "activeSearch" | "completed"
>>(nextState: T): T {
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

function createSearch(newPhotoId: string, low: number, high: number): InsertionSearch {
  return {
    newPhotoId,
    low,
    high,
    mid: Math.floor((low + high) / 2),
  };
}

function recordDecision(result: ComparisonResult): void {
  const pair = getCurrentPair();
  const search = state.activeSearch;
  if (!pair || !search) return;

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
  } else {
    const nextLow = result === "left" ? search.mid + 1 : search.low;
    const nextHigh = result === "right" ? search.mid : search.high;

    if (nextLow >= nextHigh) {
      state.rankingGroups.splice(nextLow, 0, { id: createId(), photoIds: [newPhoto.id] });
      finishCurrentInsertion();
    } else {
      state.activeSearch = createSearch(newPhoto.id, nextLow, nextHigh);
    }
  }

  persist();
  render();
}

function finishCurrentInsertion(): void {
  state.pendingPhotoIndex += 1;
  state.activeSearch = null;
  advanceToNextComparison(state);
}

function moveSelectedPhoto(targetGroupId: string, placement: "before" | "after" | "tie"): void {
  const selectedPhotoId = state.selectedPhotoId;
  if (!selectedPhotoId || !findPhoto(selectedPhotoId)) return;

  const targetGroup = state.rankingGroups.find((group) => group.id === targetGroupId);
  if (!targetGroup) return;

  const movingWithinSameGroup = targetGroup.photoIds.includes(selectedPhotoId);
  if (movingWithinSameGroup && targetGroup.photoIds.length === 1) return;
  if (movingWithinSameGroup && placement === "tie") return;

  state.rankingGroups = state.rankingGroups
    .map((group) => ({ ...group, photoIds: group.photoIds.filter((photoId) => photoId !== selectedPhotoId) }))
    .filter((group) => group.photoIds.length > 0);

  const targetIndex = state.rankingGroups.findIndex((group) => group.id === targetGroupId);
  if (targetIndex === -1) return;

  if (placement === "tie") {
    state.rankingGroups[targetIndex].photoIds.push(selectedPhotoId);
  } else {
    const insertionIndex = placement === "before" ? targetIndex : targetIndex + 1;
    state.rankingGroups.splice(insertionIndex, 0, { id: createId(), photoIds: [selectedPhotoId] });
  }

  persist();
  render();
}

function getCurrentPair(): [PhotoItem, PhotoItem] | null {
  const search = state.activeSearch;
  if (!search) return null;

  const existingPhotoId = state.rankingGroups[search.mid]?.photoIds[0];
  const existingPhoto = existingPhotoId ? findPhoto(existingPhotoId) : null;
  const newPhoto = findPhoto(search.newPhotoId);

  if (!existingPhoto || !newPhoto) return null;
  return [existingPhoto, newPhoto];
}

function render(): void {
  const pair = getCurrentPair();
  const leftPhoto = pair?.[0] ?? state.photos[0] ?? null;
  const rightPhoto = pair?.[1] ?? getActiveNewPhoto();
  const remaining = getRemainingPhotos();

  renderControls();
  renderPhoto("left", leftPhoto);
  renderPhoto("right", rightPhoto);

  elements.photoCount.textContent = String(state.photos.length);
  elements.comparisonCount.textContent = String(state.comparisons.length);
  elements.remainingCount.textContent = String(remaining);

  const hasPair = Boolean(pair);
  elements.leftButton.disabled = !hasPair;
  elements.rightButton.disabled = !hasPair;
  elements.tieButton.disabled = !hasPair;
  elements.exportButton.disabled = state.rankingGroups.length === 0;

  if (pair && state.activeSearch) {
    const activePosition = state.pendingPhotoIndex + 1;
    elements.pairLabel.textContent =
      `Insert photo ${activePosition} of ${state.photos.length}. ` +
      `Compare against ranked position ${state.activeSearch.mid + 1}.`;
  } else if (state.uploadedPhotos.length === 0) {
    elements.pairLabel.textContent = "Upload a folder or image set to begin.";
  } else if (state.photos.length === 0 && state.selectedModeId === CUSTOM_MODE_ID) {
    elements.pairLabel.textContent = "Choose photos for a custom test set, then start the set.";
  } else if (state.photos.length === 0) {
    elements.pairLabel.textContent = "Choose a grouping mode and anonymous group to rank.";
  } else if (state.photos.length === 1) {
    elements.pairLabel.textContent = "One photo loaded in this group.";
  } else if (state.completed) {
    elements.pairLabel.textContent = "Ranking complete. You can still adjust the order below.";
  } else {
    elements.pairLabel.textContent = "Preparing the next comparison.";
  }

  renderRanking();
  renderExportPreview();
}

function renderControls(): void {
  renderModeSelect();
  renderGroupSelect();
  renderCustomPanel();
}

function renderModeSelect(): void {
  elements.modeSelect.replaceChildren();

  const modeOptions = getAvailableModeOptions();
  if (modeOptions.length === 0) {
    const option = document.createElement("option");
    option.textContent = "No modes available";
    option.value = "";
    elements.modeSelect.append(option);
    elements.modeSelect.disabled = true;
    return;
  }

  modeOptions.forEach((mode) => {
    const option = document.createElement("option");
    option.value = mode.id;
    option.textContent = mode.label;
    option.selected = mode.id === state.selectedModeId;
    elements.modeSelect.append(option);
  });
  elements.modeSelect.disabled = false;
}

function renderGroupSelect(): void {
  elements.groupSelect.replaceChildren();

  if (state.selectedModeId === CUSTOM_MODE_ID) {
    const option = document.createElement("option");
    option.textContent = "Custom set";
    option.value = "";
    elements.groupSelect.append(option);
    elements.groupSelect.disabled = true;
    return;
  }

  const categories = getCategoriesForSelectedMode();
  if (categories.length === 0) {
    const option = document.createElement("option");
    option.textContent = "No groups available";
    option.value = "";
    elements.groupSelect.append(option);
    elements.groupSelect.disabled = true;
    return;
  }

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.key;
    option.textContent = getAnonymousGroupLabel(category);
    option.selected = category.key === state.selectedCategoryKey;
    elements.groupSelect.append(option);
  });
  elements.groupSelect.disabled = false;
}

function renderCustomPanel(): void {
  elements.customPanel.hidden = state.selectedModeId !== CUSTOM_MODE_ID;
  elements.customPhotoGrid.replaceChildren();
  elements.startCustomButton.disabled = state.customPhotoIds.length === 0;
  if (state.selectedModeId !== CUSTOM_MODE_ID) return;

  getUploadedPhotosInAnonymousOrder().forEach((photo) => {
    const button = document.createElement("button");
    const image = document.createElement("img");
    const label = document.createElement("span");

    button.className = state.customPhotoIds.includes(photo.id) ? "custom-photo selected" : "custom-photo";
    button.type = "button";
    button.dataset.photoId = photo.id;
    image.src = photo.dataUrl;
    image.alt = getUploadedPhotoLabel(photo);
    label.textContent = getUploadedPhotoLabel(photo);

    button.append(image, label);
    elements.customPhotoGrid.append(button);
  });
}

function renderPhoto(side: "left" | "right", photo: PhotoItem | null): void {
  const image = side === "left" ? elements.leftImage : elements.rightImage;
  const placeholder = side === "left" ? elements.leftPlaceholder : elements.rightPlaceholder;
  const name = side === "left" ? elements.leftName : elements.rightName;

  if (!photo) {
    image.removeAttribute("src");
    image.style.display = "none";
    placeholder.style.display = "block";
    name.textContent = side === "left" ? "Ranked photo" : "New photo";
    return;
  }

  image.src = photo.dataUrl;
  image.style.display = "block";
  placeholder.style.display = "none";
  name.textContent = side === "left" ? "Ranked photo" : "New photo";
}

function renderRanking(): void {
  elements.rankingList.replaceChildren();

  if (state.rankingGroups.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No ranking data yet.";
    elements.rankingList.append(item);
    return;
  }

  state.rankingGroups.forEach((group, index) => {
    const item = document.createElement("li");
    const header = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const photoGrid = document.createElement("div");

    header.className = "rank-header";
    photoGrid.className = "rank-photo-grid";
    title.textContent = `Rank ${index + 1}${index === 0 ? " - most developed" : ""}`;
    meta.textContent = group.photoIds.length > 1 ? "tie group" : "single photo";
    header.append(title, meta);

    group.photoIds.forEach((photoId) => {
      const photo = findPhoto(photoId);
      if (!photo) return;

      const card = document.createElement("div");
      const image = document.createElement("img");
      const label = document.createElement("span");
      const button = document.createElement("button");

      card.className = photoId === state.selectedPhotoId ? "rank-photo selected" : "rank-photo";
      image.src = photo.dataUrl;
      image.alt = getAnonymousPhotoLabel(photo);
      label.textContent = getAnonymousPhotoLabel(photo);
      button.className = "button secondary compact";
      button.type = "button";
      button.dataset.action = "select";
      button.dataset.photoId = photoId;
      button.textContent = photoId === state.selectedPhotoId ? "Selected" : "Select";

      card.append(image, label, button);
      photoGrid.append(card);
    });

    item.append(header, photoGrid);

    if (state.selectedPhotoId) {
      const controls = document.createElement("div");
      controls.className = "insert-controls";
      controls.append(
        createMoveButton("before", group.id, "more developed than this"),
        createMoveButton("tie", group.id, "Tie here"),
        createMoveButton("after", group.id, "less developed than this"),
      );
      item.append(controls);
    }

    elements.rankingList.append(item);
  });
}

function createMoveButton(action: string, groupId: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "button secondary compact";
  button.type = "button";
  button.dataset.action = action;
  button.dataset.groupId = groupId;
  button.textContent = label;
  return button;
}

function renderExportPreview(): void {
  const category = getSelectedCategory();
  const summary = {
    selectedMode: getSelectedModeLabel(),
    selectedGroup: state.selectedModeId === CUSTOM_MODE_ID ? "Custom set" : category ? getAnonymousGroupLabel(category) : "",
    completed: state.completed,
    rankedPhotos: state.rankingGroups.reduce((count, group) => count + group.photoIds.length, 0),
    csvIncludes: ["rank", "fileName", "woodName", "treeId", "branchId", "date"],
  };
  elements.historyOutput.textContent = JSON.stringify(summary, null, 2);
}

function createCsvRows(): string[][] {
  const category = getSelectedCategory();
  const completedAt = new Date().toISOString();
  const groupingMode = getSelectedModeLabel();
  const anonymousGroup = state.selectedModeId === CUSTOM_MODE_ID ? "Custom set" : category ? getAnonymousGroupLabel(category) : "";
  const parsedGroup = state.selectedModeId === CUSTOM_MODE_ID ? "Custom set" : category?.exportLabel ?? "";
  return [
    [
      "rank",
      "tieGroupPosition",
      "anonymousLabel",
      "fileName",
      "sourcePath",
      "woodName",
      "treeId",
      "branchId",
      "date",
      "dateRaw",
      "groupingMode",
      "anonymousGroup",
      "parsedGroup",
      "comparisonCount",
      "completedAt",
    ],
    ...state.rankingGroups.flatMap((group, rankIndex) =>
      group.photoIds.map((photoId, tieIndex) => {
        const photo = findPhoto(photoId);
        return [
          String(rankIndex + 1),
          String(tieIndex + 1),
          photo ? getAnonymousPhotoLabel(photo) : "Missing photo",
          photo?.name ?? "Missing photo",
          photo?.metadata.sourcePath ?? "",
          photo?.metadata.woodName ?? "",
          photo?.metadata.treeId ?? "",
          photo?.metadata.branchId ?? "",
          photo?.metadata.dateIso ?? "",
          photo?.metadata.dateRaw ?? "",
          groupingMode,
          anonymousGroup,
          parsedGroup,
          String(state.comparisons.length),
          completedAt,
        ];
      }),
    ),
  ];
}

function downloadRankingCsv(): void {
  const csv = createCsvRows().map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const selectedCategory = getSelectedCategory();
  const categorySlug = slugify(
    state.selectedModeId === CUSTOM_MODE_ID
      ? "custom-set"
      : selectedCategory
        ? getAnonymousGroupLabel(selectedCategory)
        : "ranking",
  );
  link.href = url;
  link.download = `${categorySlug}-ranking.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getActiveNewPhoto(): PhotoItem | null {
  if (state.pendingPhotoIndex >= state.photos.length) return null;
  return state.photos[state.pendingPhotoIndex] ?? null;
}

function getRemainingPhotos(): number {
  if (state.photos.length === 0) return 0;
  return Math.max(state.photos.length - state.pendingPhotoIndex, 0);
}

function findPhoto(id: string): PhotoItem | null {
  return state.photos.find((photo) => photo.id === id) ?? state.uploadedPhotos.find((photo) => photo.id === id) ?? null;
}

function getAvailableModeOptions(): Array<{ id: string; label: string }> {
  const modeMap = new Map<string, string>();
  state.categories.forEach((category) => {
    modeMap.set(category.modeId, category.modeLabel);
  });
  if (state.uploadedPhotos.length > 0) {
    modeMap.set(CUSTOM_MODE_ID, "Custom test set");
  }
  return Array.from(modeMap, ([id, label]) => ({ id, label }));
}

function getSelectedCategory(): ParsedCategory | null {
  return state.categories.find((item) => item.key === state.selectedCategoryKey) ?? null;
}

function getSelectedModeLabel(): string {
  if (state.selectedModeId === CUSTOM_MODE_ID) return "Custom test set";
  return getSelectedCategory()?.modeLabel ?? getAvailableModeOptions().find((mode) => mode.id === state.selectedModeId)?.label ?? "";
}

function getAnonymousGroupLabel(category: ParsedCategory): string {
  return category.label.replace(`${category.modeLabel} - `, "");
}

function getAnonymousPhotoLabel(photo: PhotoItem): string {
  const index = state.anonymousPhotoOrder.findIndex((photoId) => photoId === photo.id);
  return index >= 0 ? `Photo ${index + 1}` : "Photo";
}

function getUploadedPhotoLabel(photo: PhotoItem): string {
  return getAnonymousPhotoLabel(photo);
}

function getUploadedPhotosInAnonymousOrder(): PhotoItem[] {
  const orderedPhotos = state.anonymousPhotoOrder
    .map((photoId) => state.uploadedPhotos.find((photo) => photo.id === photoId))
    .filter((photo): photo is PhotoItem => Boolean(photo));
  const orderedIds = new Set(orderedPhotos.map((photo) => photo.id));
  return [
    ...orderedPhotos,
    ...state.uploadedPhotos.filter((photo) => !orderedIds.has(photo.id)),
  ];
}

function getFilePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function getPathParts(file: File): string[] {
  return getFilePath(file).split("/").filter(Boolean);
}

function randomizePhotoOrder<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function formatDate(dateRaw: string): string {
  const month = dateRaw.slice(0, 2);
  const day = dateRaw.slice(2, 4);
  const year = dateRaw.slice(4, 8);
  return `${year}-${month}-${day}`;
}

function escapeCsvValue(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "ranking";
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Session was not saved locally, probably because uploaded images are too large.", error);
  }
}

function loadState(): AppState {
  const rawState = localStorage.getItem(STORAGE_KEY);
  if (!rawState) return emptyState();

  try {
    const parsed = JSON.parse(rawState) as Partial<AppState>;
    const uploadedPhotos = (Array.isArray(parsed.uploadedPhotos)
      ? parsed.uploadedPhotos
      : Array.isArray(parsed.photos)
        ? parsed.photos
        : []
    ).map(normalizeLoadedPhoto);

    return {
      uploadedPhotos,
      anonymousPhotoOrder: Array.isArray(parsed.anonymousPhotoOrder) ? parsed.anonymousPhotoOrder : [],
      categories: buildCategories(uploadedPhotos),
      selectedModeId: typeof parsed.selectedModeId === "string" ? parsed.selectedModeId : "",
      selectedCategoryKey: typeof parsed.selectedCategoryKey === "string" ? parsed.selectedCategoryKey : "",
      customPhotoIds: Array.isArray(parsed.customPhotoIds) ? parsed.customPhotoIds : [],
      photos: Array.isArray(parsed.photos) ? parsed.photos.map(normalizeLoadedPhoto) : [],
      rankingGroups: Array.isArray(parsed.rankingGroups) ? parsed.rankingGroups : [],
      pendingPhotoIndex: typeof parsed.pendingPhotoIndex === "number" ? parsed.pendingPhotoIndex : 0,
      activeSearch: parsed.activeSearch ?? null,
      comparisons: Array.isArray(parsed.comparisons) ? parsed.comparisons : [],
      completed: Boolean(parsed.completed),
      selectedPhotoId: parsed.selectedPhotoId ?? null,
    };
  } catch {
    return emptyState();
  }
}

function normalizeLoadedPhoto(photo: PhotoItem): PhotoItem {
  if (photo.metadata) return photo;

  return {
    ...photo,
    metadata: {
      woodName: "Uploaded photos",
      treeId: "unparsed",
      branchId: "unparsed",
      dateRaw: "",
      dateIso: "",
      sourcePath: photo.name,
      parsed: false,
    },
  };
}

function normalizeState(): void {
  if (state.uploadedPhotos.length === 0 && state.photos.length > 0) {
    state.uploadedPhotos = state.photos;
  }

  if (state.uploadedPhotos.length === 0) {
    state = emptyState();
    return;
  }

  state.categories = state.categories.length > 0 ? state.categories : buildCategories(state.uploadedPhotos);
  normalizeAnonymousPhotoOrder();
  const availableModes = getAvailableModeOptions();
  if (!availableModes.some((mode) => mode.id === state.selectedModeId)) {
    state.selectedModeId = availableModes[0]?.id || "";
  }

  if (state.selectedModeId === CUSTOM_MODE_ID) {
    state.customPhotoIds = state.customPhotoIds.filter((photoId) =>
      state.uploadedPhotos.some((photo) => photo.id === photoId),
    );
    if (state.photos.length === 0 && state.customPhotoIds.length > 0) {
      startCustomSession();
    }
    return;
  }

  const categoriesForMode = getCategoriesForSelectedMode();
  if (!categoriesForMode.some((category) => category.key === state.selectedCategoryKey)) {
    state.selectedCategoryKey = categoriesForMode[0]?.key || "";
    startSelectedCategorySession();
    return;
  }

  if (state.photos.length === 0 && state.selectedCategoryKey) {
    startSelectedCategorySession();
  }
}

function normalizeAnonymousPhotoOrder(): void {
  const uploadedIds = new Set(state.uploadedPhotos.map((photo) => photo.id));
  const savedOrder = state.anonymousPhotoOrder.filter((photoId) => uploadedIds.has(photoId));
  const savedIds = new Set(savedOrder);
  const missingIds = state.uploadedPhotos
    .filter((photo) => !savedIds.has(photo.id))
    .map((photo) => photo.id);
  state.anonymousPhotoOrder = [
    ...savedOrder,
    ...randomizePhotoOrder(missingIds),
  ];
}

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
