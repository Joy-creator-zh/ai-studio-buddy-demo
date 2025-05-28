console.log("智能网页助手 content script loaded.");

let resultModalDiv = null;
let resultModalOverlay = null;
let floatingMenu = null;
let currentSelection = null;

function createResultModal(data) {
  // data object expected to have: 
  // modalTitle, originalText, processedText, isError (boolean), operationType ('translation' or 'summary')

  if (resultModalOverlay) resultModalOverlay.remove();
  if (resultModalDiv) resultModalDiv.remove();

  resultModalOverlay = document.createElement('div');
  resultModalOverlay.id = "sw-result-overlay";
  resultModalOverlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.6); /* 加深遮罩 */
    z-index: 2147483640; 
    display: flex; justify-content: center; align-items: center;
    backdrop-filter: blur(3px); /* 轻微的毛玻璃效果 (现代浏览器支持) */
  `;

  resultModalDiv = document.createElement('div');
  resultModalDiv.id = "sw-result-modal";
  resultModalDiv.style.cssText = `
    background-color: #ffffff; 
    padding: 25px 30px; /* 调整内边距 */
    border-radius: 12px; /* 更大的圆角 */
    box-shadow: 0 5px 20px rgba(0,0,0,0.15); /* 更明显的阴影 */
    width: 90%; 
    max-width: 580px; /* 稍微调整最大宽度 */
    max-height: 85vh; /* 调整最大高度 */
    overflow-y: auto; 
    z-index: 2147483641; 
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
    font-size: 16px; 
    line-height: 1.6; 
    color: #333;
    border: 1px solid #e0e0e0; /* 添加一个非常细的边框 */
  `;

  const titleEl = document.createElement('h2');
  titleEl.textContent = data.modalTitle || (data.isError ? "操作失败" : "操作结果");
  titleEl.style.cssText = `
    margin-top: 0; 
    margin-bottom: 25px; /* 增加与下方内容的间距 */
    font-size: 22px; 
    color: ${data.isError ? '#d93025' : '#007bff'}; /* 错误用红色，成功用主题蓝 */
    text-align: center; 
    font-weight: 600; /* 标题加粗 */
  `;
  resultModalDiv.appendChild(titleEl);

  if (data.originalText) {
    const originalSection = document.createElement('div');
    originalSection.style.marginBottom = "15px";
    const originalTitle = document.createElement('strong');
    originalTitle.textContent = "原文:";
    originalTitle.style.cssText = "display: block; margin-bottom: 8px; color: #495057; font-size: 14px; font-weight: 600;";
    const originalContent = document.createElement('p');
    originalContent.textContent = data.originalText;
    originalContent.style.cssText = `
      margin: 0 0 15px 0; /* 调整外边距 */
      padding: 10px 12px; 
      background-color: #f8f9fa; /* 浅灰背景 */
      border-radius: 6px; 
      font-size: 15px; 
      max-height: 180px; /* 调整最大高度 */
      overflow-y: auto;
      border: 1px solid #e9ecef;
    `;
    originalSection.appendChild(originalTitle);
    originalSection.appendChild(originalContent);
    resultModalDiv.appendChild(originalSection);
  }

  const processedLabel = data.operationType === 'summary' ? "总结:" : (data.operationType === 'translation' ? "译文:" : "结果:");
  const processedSection = document.createElement('div');
  processedSection.style.marginBottom = "20px";
  const processedTitle = document.createElement('strong');
  processedTitle.textContent = data.isError ? "错误信息:" : processedLabel;
  processedTitle.style.cssText = "display: block; margin-bottom: 8px; color: #495057; font-size: 14px; font-weight: 600;";
  const processedContent = document.createElement('p');
  processedContent.textContent = data.processedText;
  processedContent.style.cssText = `
    margin: 0; 
    padding: 10px 12px; 
    border-radius: 6px; 
    font-size: 15px; 
    max-height: 220px; /* 调整最大高度 */
    overflow-y: auto; 
    background-color: ${data.isError ? '#f8d7da' : (data.operationType === 'summary' ? '#d4edda' : '#d1ecf1') }; 
    color: ${data.isError ? '#721c24' : (data.operationType === 'summary' ? '#155724' : '#0c5460') }; 
    border: 1px solid ${data.isError ? '#f5c6cb' : (data.operationType === 'summary' ? '#c3e6cb' : '#bee5eb') };
    ${!data.isError ? 'font-weight: 500;' : ''}
  `;
  processedSection.appendChild(processedTitle);
  processedSection.appendChild(processedContent);
  resultModalDiv.appendChild(processedSection);

  const closeButton = document.createElement('button');
  closeButton.textContent = "关闭";
  closeButton.style.cssText = `
    display: block; 
    margin: 25px auto 0 auto; /* 调整外边距 */
    padding: 10px 25px; 
    font-size: 16px;
    color: #fff; 
    background-color: ${data.isError ? '#c82333' : '#007bff'}; 
    border: none;
    border-radius: 6px; 
    cursor: pointer; 
    font-weight: 500;
    transition: background-color 0.2s ease;
  `;
  closeButton.onmouseover = () => { closeButton.style.backgroundColor = data.isError ? '#a50e0e' : '#0056b3'; };
  closeButton.onmouseout = () => { closeButton.style.backgroundColor = data.isError ? '#c82333' : '#007bff'; };

  closeButton.onclick = () => {
    if (resultModalOverlay) resultModalOverlay.remove();
    resultModalOverlay = null;
    resultModalDiv = null;
  };
  resultModalDiv.appendChild(closeButton);
  
  resultModalOverlay.appendChild(resultModalDiv);
  document.body.appendChild(resultModalOverlay);

  resultModalOverlay.addEventListener('click', (event) => {
    if (event.target === resultModalOverlay) closeButton.click();
  });
}

function createFloatingMenu() {
  if (floatingMenu) {
    floatingMenu.remove();
    floatingMenu = null;
  }

  floatingMenu = document.createElement('div');
  floatingMenu.id = 'sw-floating-menu';
  floatingMenu.style.cssText = `
    position: absolute;
    background-color: #343a40; /* 深色背景 */
    color: white;
    padding: 5px; /* 整体内边距减少 */
    border-radius: 6px;
    z-index: 2147483642; 
    box-shadow: 0 4px 12px rgba(0,0,0,0.2); /* 更清晰的阴影 */
    display: none; 
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
    line-height: 1;
    opacity: 0.95; /* 轻微透明，可选 */
  `;

  const buttonActions = [
    { id: 'sw-translate-btn', text: '翻译', title: '翻译选中文本', actionType: 'translate' },
    { id: 'sw-summarize-btn', text: '总结', title: '总结选中文本', actionType: 'summarize' },
    { id: 'sw-copy-btn', text: '复制', title: '复制选中文本', actionType: 'copy' },
    { id: 'sw-addword-btn', text: '记单词', title: '将选中文本添加到单词本', actionType: 'addWord' }
  ];

  buttonActions.forEach(action => {
    const button = document.createElement('button');
    button.id = action.id;
    button.textContent = action.text;
    button.title = action.title;
    button.style.cssText = `
      background-color: transparent;
      color: #f8f9fa; /* 亮色文字 */
      border: none;
      padding: 7px 10px; /* 调整内边距 */
      margin: 0 2px;
      cursor: pointer;
      font-size: 13px;
      border-radius: 4px;
      transition: background-color 0.15s ease, color 0.15s ease;
      font-weight: 500;
    `;
    button.onmouseover = () => {
        button.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'; /* 悬停时浅色高亮 */
        button.style.color = '#ffffff';
    };
    button.onmouseout = () => {
        button.style.backgroundColor = 'transparent';
        button.style.color = '#f8f9fa';
    };

    button.addEventListener('click', (event) => {
      event.stopPropagation(); // Prevent menu from hiding due to mousedown on body
      if (!currentSelection) {
        console.warn("SW: No text selected for action:", action.actionType);
        hideFloatingMenu();
        return;
      }
      const selectedText = currentSelection.toString().trim();
      if (!selectedText) {
        console.warn("SW: Selected text is empty for action:", action.actionType);
        hideFloatingMenu();
        return;
      }

      console.log(`SW: Action '${action.actionType}' triggered for text:`, selectedText);

      switch (action.actionType) {
        case 'translate':
          chrome.runtime.sendMessage({
            type: "translateText",
            text: selectedText,
            source: "floatingMenu"
          });
          break;
        case 'summarize':
          chrome.runtime.sendMessage({
            type: "summarizeText",
            text: selectedText,
            source: "floatingMenu"
          });
          break;
        case 'copy':
          navigator.clipboard.writeText(selectedText).then(() => {
            console.log('SW: Text copied to clipboard:', selectedText);
            // Optionally show a temporary "Copied!" message in the menu
            const originalText = button.textContent;
            button.textContent = '已复制!';
            button.style.color = '#28a745'; // 使用更鲜明的成功绿色
            button.style.backgroundColor = 'rgba(40, 167, 69, 0.1)'; // 轻微的绿色背景
            setTimeout(() => {
                button.textContent = originalText;
                button.style.color = '#f8f9fa'; // 恢复原始颜色
                button.style.backgroundColor = 'transparent'; // 恢复原始背景
            }, 1500);
          }).catch(err => {
            console.error('SW: Failed to copy text: ', err);
            // Optionally show an error message
          });
          break;
        case 'addWord':
          chrome.runtime.sendMessage({
            type: "addWordToVocab",
            text: selectedText,
            source: "floatingMenu"
          });
          // We'll handle feedback for this later, perhaps via the modal or a different notification
          console.log("SW: 'Add Word' clicked. Functionality to be fully implemented in background.");
          break;
      }
      hideFloatingMenu(); // Hide menu after action
    });
    floatingMenu.appendChild(button);
  });

  document.body.appendChild(floatingMenu);

  floatingMenu.addEventListener('mousedown', (e) => e.stopPropagation());
  floatingMenu.addEventListener('mouseup', (e) => e.stopPropagation()); 
}

function showFloatingMenu(selection) {
  if (!floatingMenu) {
    createFloatingMenu();
  }
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    hideFloatingMenu();
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  // Calculate position (e.g., above the selection)
  // Adjustments might be needed based on scroll position and menu size
  let top = window.scrollY + rect.top - (floatingMenu.offsetHeight || 30) - 5; // 30 is an estimated height, 5px offset
  let left = window.scrollX + rect.left + (rect.width / 2) - (floatingMenu.offsetWidth || 60) / 2; // 60 is an estimated width

  // Boundary checks to keep menu within viewport (very basic)
  if (top < window.scrollY + 5) { // If too close to top, show below selection
      top = window.scrollY + rect.bottom + 5;
  }
  if (left < window.scrollX + 5) left = window.scrollX + 5;
  if (left + (floatingMenu.offsetWidth || 60) > window.scrollX + window.innerWidth - 5) {
      left = window.scrollX + window.innerWidth - (floatingMenu.offsetWidth || 60) - 5;
  }

  floatingMenu.style.top = `${top}px`;
  floatingMenu.style.left = `${left}px`;
  floatingMenu.style.display = 'block';
}

function hideFloatingMenu() {
  if (floatingMenu) {
    floatingMenu.style.display = 'none';
  }
  currentSelection = null;
}

// Debounce mouseup to avoid flickering or multiple triggers
let mouseUpTimeout;
document.addEventListener('mouseup', (event) => {
  // Don't show menu if clicking inside our own UI elements (e.g. the result modal)
  if (event.target && (event.target.closest('#sw-result-modal') || event.target.closest('#sw-result-overlay'))) {
    return;
  }
  if (floatingMenu && floatingMenu.contains(event.target)) {
      // Click was inside the floating menu, don't hide it immediately
      return;
  }

  clearTimeout(mouseUpTimeout);
  mouseUpTimeout = setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText.length > 0) {
      currentSelection = selection.getRangeAt(0).cloneRange(); // Store the range
      showFloatingMenu(selection);
    } else {
      hideFloatingMenu();
    }
  }, 100); // Small delay to allow for selection to finalize and prevent issues with clicks
});

// Hide menu if clicked outside, or if selection is lost
document.addEventListener('mousedown', (event) => {
  if (floatingMenu && floatingMenu.style.display === 'block') {
    if (!floatingMenu.contains(event.target)) {
         // Check if the click is on a new selection. If so, mouseup will handle it.
        const tempSelection = window.getSelection();
        if (!tempSelection || tempSelection.isCollapsed || tempSelection.toString().trim().length === 0) {
            hideFloatingMenu();
        }
    }
  }
});

// Create the menu div once when the script loads so it's ready
// createFloatingMenu(); // Or create on first selection

// Existing message listener for modal
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "showTranslationModal" || request.type === "showResultModal") {
    console.log("Content script received showResultModal (or compatible):", request);
    // Adapt data for createResultModal if it's the old format
    const modalData = request.type === "showTranslationModal" ? 
        {
            modalTitle: request.isError ? "翻译失败" : "翻译结果",
            originalText: request.originalText,
            processedText: request.translatedText,
            isError: request.isError || false,
            operationType: "translation"
        } : request;

    createResultModal(modalData);
    sendResponse({ status: "modal_shown" }); 
  }
  return true; 
});

// 未来可能需要的功能:
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   if (request.action === "getSelection") {
//     sendResponse({selection: window.getSelection().toString()});
//   }
//   return true; // Indicates that the response is sent asynchronously
// }); 