/**
 * Storage layer for folder and conversation data.
 *
 * Data schema (chrome.storage.local):
 * {
 *   folders: [
 *     { id, name, order, conversationIds: [] }
 *   ]
 * }
 */
const Storage = (() => {
  const STORAGE_KEY = 'folders';

  function _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  async function getFolders() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  }

  async function saveFolders(folders) {
    await chrome.storage.local.set({ [STORAGE_KEY]: folders });
  }

  async function createFolder(name) {
    const folders = await getFolders();
    const maxOrder = folders.reduce((max, f) => Math.max(max, f.order), -1);
    const folder = {
      id: _generateId(),
      name,
      order: maxOrder + 1,
      conversationIds: [],
    };
    folders.push(folder);
    await saveFolders(folders);
    return folder;
  }

  async function renameFolder(folderId, newName) {
    const folders = await getFolders();
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return null;
    folder.name = newName;
    await saveFolders(folders);
    return folder;
  }

  async function deleteFolder(folderId) {
    let folders = await getFolders();
    folders = folders.filter((f) => f.id !== folderId);
    await saveFolders(folders);
  }

  async function reorderFolders(orderedIds) {
    const folders = await getFolders();
    orderedIds.forEach((id, index) => {
      const folder = folders.find((f) => f.id === id);
      if (folder) folder.order = index;
    });
    await saveFolders(folders);
  }

  async function addConversation(folderId, conversationId) {
    const folders = await getFolders();
    // Remove from any existing folder first
    for (const f of folders) {
      f.conversationIds = f.conversationIds.filter((c) => c !== conversationId);
    }
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return null;
    folder.conversationIds.push(conversationId);
    await saveFolders(folders);
    return folder;
  }

  async function removeConversation(folderId, conversationId) {
    const folders = await getFolders();
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return null;
    folder.conversationIds = folder.conversationIds.filter((c) => c !== conversationId);
    await saveFolders(folders);
    return folder;
  }

  return {
    getFolders,
    saveFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    reorderFolders,
    addConversation,
    removeConversation,
  };
})();
