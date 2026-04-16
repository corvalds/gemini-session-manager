/**
 * Gemini Session Manager - Content Script
 *
 * Injects folder UI into Gemini's sidebar, allowing users to
 * create folders, drag conversations into them, rename, and reorder.
 */
(() => {
  const SIDEBAR_POLL_INTERVAL = 1500;
  const CONTAINER_ID = 'gsm-folder-container';

  let folders = [];
  let openFolderIds = new Set();

  // ===== Initialization =====

  async function init() {
    folders = await Storage.getFolders();
    waitForSidebar();
  }

  function waitForSidebar() {
    const tryInject = () => {
      const sidebar = findSidebar();
      if (sidebar && !document.getElementById(CONTAINER_ID)) {
        injectFolderUI(sidebar);
        observeSidebarConversations(sidebar);
      }
    };
    tryInject();
    setInterval(tryInject, SIDEBAR_POLL_INTERVAL);
  }

  function findSidebar() {
    // Gemini's sidebar nav containing conversation list
    return document.querySelector('nav.gmat-nav-list')
      || document.querySelector('[role="navigation"]')
      || document.querySelector('.conversation-list');
  }

  // ===== Render =====

  function injectFolderUI(sidebar) {
    const container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.className = 'gsm-folder-section';
    sidebar.insertBefore(container, sidebar.firstChild);
    renderFolders();
  }

  async function renderFolders() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    folders = await Storage.getFolders();
    folders.sort((a, b) => a.order - b.order);

    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'gsm-folder-header';
    header.innerHTML = `
      <span>Folders</span>
      <button class="gsm-add-folder-btn" title="New folder"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg></button>
    `;
    header.querySelector('.gsm-add-folder-btn').addEventListener('click', handleCreateFolder);
    container.appendChild(header);

    // Folder list
    for (const folder of folders) {
      container.appendChild(createFolderElement(folder));
    }
  }

  function createFolderElement(folder) {
    const el = document.createElement('div');
    el.className = 'gsm-folder' + (openFolderIds.has(folder.id) ? ' gsm-open' : '');
    el.dataset.folderId = folder.id;

    // Title bar
    const titleBar = document.createElement('div');
    titleBar.className = 'gsm-folder-title';
    titleBar.draggable = true;
    titleBar.innerHTML = `
      <svg class="gsm-folder-arrow" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
      <span class="gsm-folder-name">${escapeHtml(folder.name)}</span>
      <span class="gsm-folder-count">${folder.conversationIds.length}</span>
      <span class="gsm-folder-actions">
        <button class="gsm-folder-action-btn gsm-rename-btn" title="Rename"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
        <button class="gsm-folder-action-btn gsm-delete-btn" title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
      </span>
    `;

    // Toggle open/close
    titleBar.addEventListener('click', (e) => {
      if (e.target.closest('.gsm-folder-actions')) return;
      toggleFolder(folder.id);
    });

    // Rename
    titleBar.querySelector('.gsm-rename-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(folder, el);
    });

    // Delete
    titleBar.querySelector('.gsm-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteFolder(folder.id);
    });

    // Drag & drop for folder reorder
    setupFolderDrag(titleBar, folder, el);

    // Drop zone for conversations
    setupConversationDrop(el, folder);

    el.appendChild(titleBar);

    // Conversation list
    const convList = document.createElement('div');
    convList.className = 'gsm-folder-conversations';

    if (folder.conversationIds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'gsm-folder-empty';
      empty.textContent = 'Drag conversations here';
      convList.appendChild(empty);
    } else {
      for (const convId of folder.conversationIds) {
        convList.appendChild(createConversationItem(folder.id, convId));
      }
    }

    el.appendChild(convList);
    return el;
  }

  function createConversationItem(folderId, convId) {
    const item = document.createElement('div');
    item.className = 'gsm-folder-conv-item';
    item.dataset.convId = convId;

    // Try to find conversation name from sidebar
    const convName = getConversationName(convId) || convId;

    item.innerHTML = `
      <span class="gsm-folder-conv-name">${escapeHtml(convName)}</span>
      <button class="gsm-folder-conv-remove" title="Remove from folder"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
    `;

    // Click to navigate
    item.addEventListener('click', (e) => {
      if (e.target.closest('.gsm-folder-conv-remove')) return;
      navigateToConversation(convId);
    });

    // Remove from folder
    item.querySelector('.gsm-folder-conv-remove').addEventListener('click', async (e) => {
      e.stopPropagation();
      await Storage.removeConversation(folderId, convId);
      renderFolders();
    });

    return item;
  }

  // ===== Folder Actions =====

  async function handleCreateFolder() {
    const name = prompt('Folder name:');
    if (!name || !name.trim()) return;
    await Storage.createFolder(name.trim());
    renderFolders();
  }

  function toggleFolder(folderId) {
    if (openFolderIds.has(folderId)) {
      openFolderIds.delete(folderId);
    } else {
      openFolderIds.add(folderId);
    }
    renderFolders();
  }

  function startRename(folder, el) {
    const nameSpan = el.querySelector('.gsm-folder-name');
    const input = document.createElement('input');
    input.className = 'gsm-folder-name-input';
    input.value = folder.name;
    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    const finish = async () => {
      const newName = input.value.trim();
      if (newName && newName !== folder.name) {
        await Storage.renameFolder(folder.id, newName);
      }
      renderFolders();
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') {
        input.value = folder.name;
        input.blur();
      }
    });
  }

  async function handleDeleteFolder(folderId) {
    if (!confirm('Delete this folder? Conversations will not be deleted.')) return;
    await Storage.deleteFolder(folderId);
    openFolderIds.delete(folderId);
    renderFolders();
  }

  // ===== Drag & Drop: Folder Reorder =====

  function setupFolderDrag(titleBar, folder, el) {
    titleBar.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/gsm-folder-id', folder.id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('gsm-dragging');
    });

    titleBar.addEventListener('dragend', () => {
      el.classList.remove('gsm-dragging');
      document.querySelectorAll('.gsm-drag-over').forEach((x) => x.classList.remove('gsm-drag-over'));
    });

    el.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/gsm-folder-id')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('gsm-drag-over');
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('gsm-drag-over');
    });

    el.addEventListener('drop', async (e) => {
      el.classList.remove('gsm-drag-over');
      const draggedId = e.dataTransfer.getData('text/gsm-folder-id');
      if (!draggedId || draggedId === folder.id) return;
      e.preventDefault();

      // Reorder: move dragged folder to this folder's position
      const currentOrder = folders.map((f) => f.id);
      const fromIdx = currentOrder.indexOf(draggedId);
      const toIdx = currentOrder.indexOf(folder.id);
      if (fromIdx === -1 || toIdx === -1) return;

      currentOrder.splice(fromIdx, 1);
      currentOrder.splice(toIdx, 0, draggedId);
      await Storage.reorderFolders(currentOrder);
      renderFolders();
    });
  }

  // ===== Drag & Drop: Conversation into Folder =====

  function setupConversationDrop(folderEl, folder) {
    folderEl.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/gsm-conv-id')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      folderEl.classList.add('gsm-drag-over');
    });

    folderEl.addEventListener('dragleave', (e) => {
      if (!folderEl.contains(e.relatedTarget)) {
        folderEl.classList.remove('gsm-drag-over');
      }
    });

    folderEl.addEventListener('drop', async (e) => {
      folderEl.classList.remove('gsm-drag-over');
      const convId = e.dataTransfer.getData('text/gsm-conv-id');
      if (!convId) return;
      e.preventDefault();
      await Storage.addConversation(folder.id, convId);
      openFolderIds.add(folder.id);
      renderFolders();
    });
  }

  // ===== Sidebar Conversation Observation =====

  function observeSidebarConversations(sidebar) {
    // Make sidebar conversation items draggable
    const makeConvsDraggable = () => {
      const convLinks = sidebar.querySelectorAll('a[href*="/app/"]');
      convLinks.forEach((link) => {
        if (link.dataset.gsmDraggable) return;
        link.dataset.gsmDraggable = 'true';
        link.draggable = true;

        link.addEventListener('dragstart', (e) => {
          const convId = extractConversationId(link.getAttribute('href'));
          if (convId) {
            e.dataTransfer.setData('text/gsm-conv-id', convId);
            e.dataTransfer.effectAllowed = 'copy';
          }
        });

        // Right-click context menu to add to folder
        link.addEventListener('contextmenu', (e) => {
          const convId = extractConversationId(link.getAttribute('href'));
          if (convId && folders.length > 0) {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY, convId);
          }
        });
      });
    };

    makeConvsDraggable();

    const observer = new MutationObserver(() => {
      makeConvsDraggable();
      // Re-inject if container was removed (Gemini SPA navigation)
      if (!document.getElementById(CONTAINER_ID)) {
        const newSidebar = findSidebar();
        if (newSidebar) injectFolderUI(newSidebar);
      }
    });

    observer.observe(sidebar.parentElement || sidebar, {
      childList: true,
      subtree: true,
    });
  }

  // ===== Context Menu =====

  function showContextMenu(x, y, convId) {
    removeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'gsm-context-menu';
    menu.id = 'gsm-context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const title = document.createElement('div');
    title.className = 'gsm-context-menu-title';
    title.textContent = 'Add to folder';
    menu.appendChild(title);

    const divider = document.createElement('div');
    divider.className = 'gsm-context-menu-divider';
    menu.appendChild(divider);

    for (const folder of folders) {
      const item = document.createElement('button');
      item.className = 'gsm-context-menu-item';
      item.textContent = folder.name;
      item.addEventListener('click', async () => {
        await Storage.addConversation(folder.id, convId);
        openFolderIds.add(folder.id);
        renderFolders();
        removeContextMenu();
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);

    // Adjust position if overflowing
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', removeContextMenu, { once: true });
    }, 0);
  }

  function removeContextMenu() {
    const menu = document.getElementById('gsm-context-menu');
    if (menu) menu.remove();
  }

  // ===== Helpers =====

  function extractConversationId(href) {
    if (!href) return null;
    const match = href.match(/\/app\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  function getConversationName(convId) {
    const link = document.querySelector(`a[href*="/app/${convId}"]`);
    if (!link) return null;
    return link.textContent.trim() || null;
  }

  function navigateToConversation(convId) {
    const link = document.querySelector(`a[href*="/app/${convId}"]`);
    if (link) {
      link.click();
    } else {
      window.location.href = `/app/${convId}`;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== Start =====
  init();
})();
