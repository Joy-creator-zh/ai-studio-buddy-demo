chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translateText",
    title: "翻译选中文字",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "summarizeText",
    title: "总结选中文字",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "copyText",
    title: "复制选中文字",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "addWord",
    title: "添加到单词本",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) {
    console.error("Tab information is missing or invalid tab structure.");
    return;
  }
  const selection = info.selectionText;
  let lastOpData = null;

  if (info.menuItemId === "copyText") {
    if (selection) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: copyToClipboard,
          args: [selection]
        });
        console.log("文本已复制到剪贴板");
        await addUsageRecord("copy", selection.substring(0, 100));
      } catch (err) {
        console.error("复制失败或记录失败:", err);
      }
    }
  } else if (info.menuItemId === "translateText") {
    console.log("翻译操作触发，选中文本:", selection);
    if (selection && tab.id) { // Ensure tab.id is valid
      const translatedText = await fetchRealTranslation(selection);
      console.log("翻译API结果:", translatedText);

      if (translatedText && !translatedText.startsWith("[翻译失败")) {
        // REMOVED: showTranslationNotification("翻译结果", translatedText, selection.substring(0, 30));
        lastOpData = { type: "翻译", originalText: selection.substring(0, 100), resultText: translatedText, timestamp: new Date().toISOString() };
        
        chrome.tabs.sendMessage(tab.id, {
          type: "showTranslationModal",
          originalText: selection,
          translatedText: translatedText
        }).catch(err => console.warn("Could not send message to content script for modal", err));

      } else {
        // REMOVED: showTranslationNotification("翻译失败", translatedText || "未能获取翻译结果。", selection.substring(0, 30));
        // Optionally, still send error to modal or handle differently
        chrome.tabs.sendMessage(tab.id, { // Example: send error to modal too
            type: "showTranslationModal",
            originalText: selection,
            translatedText: translatedText || "翻译失败，请稍后再试。",
            isError: true
        }).catch(err => console.warn("Could not send error message to content script for modal", err));
      }
      await addUsageRecord("translate", selection.substring(0, 100));
    }
  } else if (info.menuItemId === "summarizeText") {
    console.log("总结操作触发，选中文本:", info.selectionText);
    if (info.selectionText && tab && tab.id) {
      const summarizedText = await fetchDeepSeekSummary(info.selectionText);
      console.log("DeepSeek总结API结果:", summarizedText);
      let isError = false;
      let modalTitle = "总结结果";

      if (summarizedText && !summarizedText.startsWith("[总结失败") && !summarizedText.startsWith("[DeepSeek API 密钥")) {
        lastOpData = { type: "总结 (DeepSeek)", originalText: info.selectionText.substring(0, 100), resultText: summarizedText, timestamp: new Date().toISOString() };
      } else {
        isError = true;
        modalTitle = "总结失败";
      }
      await addUsageRecord("summarize_deepseek", info.selectionText.substring(0, 100));
      
      // Send message to content script to display modal for summary
      chrome.tabs.sendMessage(tab.id, {
        type: "showResultModal", // Use a more generic type
        modalTitle: modalTitle,
        originalText: info.selectionText, // Send full original text for modal
        processedText: summarizedText || "未能获取总结结果。",
        isError: isError,
        operationType: "summary" // Differentiate operation
      }).catch(err => console.warn("Could not send message to content script for summary modal", err));
    }
  } else if (info.menuItemId === "addWord") {
    console.log("添加到单词本操作触发，选中文本:", selection);
    if (selection && selection.trim().length > 0) {
      try {
        await addVocabularyWord(selection.trim());
        await addUsageRecord("addWord", selection.trim());
      } catch (err) {
        console.error("添加单词或记录失败:", err);
      }
    }
  }

  if (lastOpData) {
    chrome.storage.local.set({ lastOperation: lastOpData }, () => {
      console.log("Last operation saved: ", lastOpData.type);
    });
  }
});

// Listener for messages from popup or other parts of the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "popup_翻译" && request.text) {
    (async () => {
      const originalText = request.text;
      const translatedText = await fetchRealTranslation(originalText);
      let responseStatus = 'success';
      let responseMessage = translatedText;
      let opDataForPopup = null;

      if (translatedText && !translatedText.startsWith("[翻译失败")) {
        // REMOVED: showTranslationNotification("Popup 翻译结果", translatedText, originalText.substring(0, 30));
        opDataForPopup = { type: "翻译 (Popup)", originalText: originalText.substring(0, 100), resultText: translatedText, timestamp: new Date().toISOString() };
      } else {
        // REMOVED: showTranslationNotification("Popup 翻译失败", translatedText || "未能获取翻译结果。", originalText.substring(0, 30));
        responseStatus = 'error';
        responseMessage = translatedText || "未能获取翻译结果。";
      }
      
      if (opDataForPopup) {
        chrome.storage.local.set({ lastOperation: opDataForPopup });
      }
      addUsageRecord("translate_popup", originalText.substring(0, 100));
      sendResponse({ status: responseStatus, message: responseMessage, data: opDataForPopup });
    })();
    return true; // Indicates that the response will be sent asynchronously
  }

  if (request.type === "popup_总结" && request.text) {
    (async () => {
      const originalText = request.text;
      const summarizedText = await fetchDeepSeekSummary(originalText); 
      let opDataForPopup = null;
      let responseStatus = 'success';
      let responseMessage = summarizedText;
      let isError = false;
      let modalTitle = "Popup 总结结果";

      if (summarizedText && !summarizedText.startsWith("[总结失败") && !summarizedText.startsWith("[DeepSeek API 密钥")) {
        opDataForPopup = { type: "总结 (DeepSeek/Popup)", originalText: originalText.substring(0, 100), resultText: summarizedText, timestamp: new Date().toISOString() };
      } else {
         responseStatus = 'error';
         responseMessage = summarizedText || "未能获取总结结果。";
         isError = true;
         modalTitle = "Popup 总结失败";
      }
      
      if (opDataForPopup) {
        chrome.storage.local.set({ lastOperation: opDataForPopup });
      }
      addUsageRecord("summarize_deepseek_popup", originalText.substring(0, 100));
      sendResponse({ status: responseStatus, message: responseMessage, data: opDataForPopup });
      
      // Also attempt to show modal if triggered from popup (optional, could be noisy)
      // Requires sender.tab.id to be available and valid
      if (sender.tab && sender.tab.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: "showResultModal",
            modalTitle: modalTitle,
            originalText: originalText,
            processedText: summarizedText || "未能获取总结结果。",
            isError: isError,
            operationType: "summary"
        }).catch(err => console.warn("Could not send summary modal message from popup handler to content script", err));
      }
    })();
    return true; 
  }

  if (request.type === "popup_addWord" && request.text) {
    (async () => {
      const wordToAdd = request.text.trim();
      try {
        // addVocabularyWord in background.js already handles if word exists by resolving with null
        // and logging a warning. We need to adapt it or check its return value carefully.
        // Let's modify addVocabularyWord to explicitly return a status or throw specific errors.
        
        // For now, let's assume addVocabularyWord might throw or return a specific value for existing.
        // We will reuse the existing addVocabularyWord which logs and resolves null if exists.
        const addResult = await addVocabularyWord(wordToAdd);
        
        if (addResult === null) { // Assuming null means it already existed (based on current addVocabularyWord)
          sendResponse({ status: 'exists', message: `单词 '${wordToAdd}' 已存在。` });
        } else if (addResult) { // addResult would be the id of the new record or the record itself
          addUsageRecord("addWord_popup", wordToAdd);
          sendResponse({ status: 'success', message: `单词 '${wordToAdd}' 已添加。` });
        } else {
            // This case might occur if db is not initialized, or another unhandled error in addVocabularyWord
             sendResponse({ status: 'error', message: '添加单词时发生未知错误。' });
        }
      } catch (error) {
        // This catch is for unexpected errors during the addVocabularyWord process itself.
        console.error("Error in popup_addWord:", error);
        sendResponse({ status: 'error', message: error.message || '添加单词失败。' });
      }
    })();
    return true; // Indicates that the response will be sent asynchronously
  }
  
  if (request.type === "getAllVocabulary") {
    (async () => {
      try {
        if (!db) await openDB(); // 确保数据库已打开
        const transaction = db.transaction([STORE_VOCABULARY], 'readonly');
        const store = transaction.objectStore(STORE_VOCABULARY);
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = () => {
          if (getAllRequest.result && getAllRequest.result.length > 0) {
            sendResponse({ status: 'success', data: getAllRequest.result });
          } else {
            sendResponse({ status: 'empty', data: [] });
          }
        };
        getAllRequest.onerror = (event) => {
          console.error("Error getting all vocabulary from IndexedDB:", event.target.error);
          sendResponse({ status: 'error', message: '读取数据库时出错: ' + event.target.error });
        };
      } catch (e) {
        console.error("Error in getAllVocabulary handler:", e);
        sendResponse({ status: 'error', message: '处理请求时出错: ' + e.message });
      }
    })();
    return true; // 表示我们将异步发送响应
  }

  if (request.type === "replaceAllVocabulary") {
    (async () => {
      try {
        if (!db) await openDB();
        const newVocabulary = request.data;
        if (!Array.isArray(newVocabulary)) {
          sendResponse({ status: 'error', message: '提供的数据不是有效的数组。' });
          return;
        }

        const transaction = db.transaction([STORE_VOCABULARY], 'readwrite');
        const store = transaction.objectStore(STORE_VOCABULARY);
        
        const clearRequest = store.clear(); // 清空对象存储

        clearRequest.onsuccess = () => {
          // 逐条添加新数据
          // 如果数据量很大，这个逐条添加可能会慢。
          // 可以考虑批量添加，但IndexedDB标准API没有直接的批量添加，
          // 通常是通过多次 put/add 实现。
          let itemsAdded = 0;
          if (newVocabulary.length === 0) { // 如果新数据为空数组
             transaction.oncomplete = () => { // 确保事务完成后再发送响应
                console.log("Vocabulary store cleared and 0 items added.");
                sendResponse({ status: 'success', count: 0 });
             };
             return;
          }

          newVocabulary.forEach((item, index) => {
            // 可选：在这里进行数据验证和转换，确保item符合存储结构
            const addRequest = store.add(item);
            addRequest.onsuccess = () => {
              itemsAdded++;
              if (itemsAdded === newVocabulary.length) {
                // 所有项都已尝试添加（成功或失败）
                // transaction.oncomplete 会在所有写操作完成后触发
              }
            };
            addRequest.onerror = (event) => {
              console.error(`Error adding item to vocabulary: ${item.word}`, event.target.error);
              // 你可以选择是否因为单个条目失败而停止整个过程
            };
          });
          
          transaction.oncomplete = () => {
            console.log(`Vocabulary store replaced. ${itemsAdded} items processed.`);
            sendResponse({ status: 'success', count: itemsAdded });
          };

          transaction.onerror = (event) => {
            console.error("Transaction error during replaceAllVocabulary:", event.target.error);
            sendResponse({ status: 'error', message: '数据库事务操作失败: ' + event.target.error });
          };
        };

        clearRequest.onerror = (event) => {
          console.error("Error clearing vocabulary store:", event.target.error);
          sendResponse({ status: 'error', message: '清空数据库时出错: ' + event.target.error });
        };

      } catch (e) {
        console.error("Error in replaceAllVocabulary handler:", e);
        sendResponse({ status: 'error', message: '处理替换请求时出错: ' + e.message });
      }
    })();
    return true; // 异步响应
  }
  
  // Handle other message types if any in the future
});

// 这个函数将在内容脚本的上下文中执行以访问剪贴板
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(err => {
    console.error('无法复制文本: ', err);
  });
}

// IndexedDB 初始化和操作函数
const DB_NAME = 'webAssistantDB';
const DB_VERSION = 1;
const STORE_USAGE_RECORDS = 'usageRecords';
const STORE_VOCABULARY = 'vocabulary';

let db;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("数据库错误: ", event.target.errorCode);
      reject(event.target.errorCode);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("数据库已成功打开");
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const tempDb = event.target.result;
      console.log("数据库升级中...");

      if (!tempDb.objectStoreNames.contains(STORE_USAGE_RECORDS)) {
        // 主键 autoIncrement
        tempDb.createObjectStore(STORE_USAGE_RECORDS, { keyPath: 'id', autoIncrement: true });
        console.log(`对象存储 '${STORE_USAGE_RECORDS}' 已创建`);
      }
      //可以为 usageRecords 创建索引，例如按时间戳或操作类型
      // usageStore.createIndex("timestamp", "timestamp", { unique: false });
      // usageStore.createIndex("action", "action", { unique: false });

      if (!tempDb.objectStoreNames.contains(STORE_VOCABULARY)) {
        // 单词本身作为主键，保证唯一性
        tempDb.createObjectStore(STORE_VOCABULARY, { keyPath: 'word' });
        console.log(`对象存储 '${STORE_VOCABULARY}' 已创建`);
      }
      //可以为 vocabulary 创建索引，例如按添加日期或复习次数
      // vocabStore.createIndex("addedDate", "addedDate", { unique: false });
    };
  });
}

// 在 service worker 启动时初始化数据库
initDB().catch(err => console.error("数据库初始化失败: ", err));

// 后续添加记录函数
async function addUsageRecord(action, textSnippet) {
  if (!db) {
    console.error("数据库未初始化，无法记录使用情况。");
    await initDB(); // 尝试重新初始化
    if (!db) return;
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_USAGE_RECORDS], 'readwrite');
    const store = transaction.objectStore(STORE_USAGE_RECORDS);
    const record = {
      action: action, // 'translate', 'summarize', 'copy', 'addWord'
      textSnippet: textSnippet, // 选中的文本片段
      timestamp: new Date().toISOString()
    };
    const request = store.add(record);
    request.onsuccess = () => {
      console.log("使用记录已添加: ", record);
      resolve(request.result);
    };
    request.onerror = (event) => {
      console.error("添加使用记录失败: ", event.target.errorCode);
      reject(event.target.errorCode);
    };
  });
}

async function addVocabularyWord(word, definition = '', exampleSentence = '') {
  if (!db) {
    console.error("数据库未初始化，无法添加单词。");
    await initDB(); 
    if (!db) return Promise.reject("DB not initialized after attempt.");
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_VOCABULARY], 'readwrite');
    const store = transaction.objectStore(STORE_VOCABULARY);
    
    const now = new Date();
    // const tomorrow = new Date(now);
    // tomorrow.setDate(now.getDate() + 1); // Initial review next day - CHANGED

    const entry = {
      word: word,
      definition: definition, 
      exampleSentence: exampleSentence, 
      addedDate: now.toISOString(),
      reviewCount: 0,
      lastReviewDate: null,
      // MODIFIED: Set nextReviewDate to now, so it appears immediately for review
      nextReviewDate: now.toISOString(), 
      easinessFactor: 2.5, 
      interval: 0, // Still 0, as it's a new word, first real interval calc on first review
      consecutiveCorrectAnswers: 0
    };
    const request = store.add(entry);
    request.onsuccess = () => {
      console.log("单词已添加到词汇表 (立即复习): ", entry);
      resolve(request.result);
    };
    request.onerror = (event) => {
      console.error("添加单词失败: ", event.target.error.name, event.target.error.message);
      if (event.target.error.name === 'ConstraintError') {
        console.warn(`单词 '${word}' 已存在于词汇表中。`);
        resolve(null); 
      } else {
        reject(event.target.error);
      }
    };
  });
}

async function fetchRealTranslation(text) {
  // Simple language detection heuristic
  const containsChinese = /[\u4e00-\u9fa5]/.test(text);
  let sourceLang, targetLang;

  if (containsChinese) {
    sourceLang = 'zh-CN';
    targetLang = 'en';
  } else {
    sourceLang = 'en';
    targetLang = 'zh-CN';
  }

  const langPair = `${sourceLang}|${targetLang}`;
  // Optional: Provide your email for a higher request limit from MyMemory
  const emailForMyMemory = 'Leeharry712512@gmail.com'; // <-- TODO: Replace with your actual email or remove/manage this
  const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}&de=${emailForMyMemory}`;

  console.log(`Fetching translation for: "${text.substring(0,30)}..." from ${sourceLang} to ${targetLang}`);

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.responseStatus !== 200) {
        // Sometimes MyMemory returns 200 OK HTTP status but an internal error status in JSON
        throw new Error(`MyMemory API error: ${data.responseDetails || data.responseStatus}`);
    }
    if (data.responseData && data.responseData.translatedText) {
      return data.responseData.translatedText;
    } else {
      throw new Error("Translated text not found in API response.");
    }
  } catch (error) {
    console.error("Translation API error:", error);
    return `[翻译失败: ${error.message}]`; // Return an error message
  }
}

const DEEPSEEK_API_KEY = "sk-5acbdac0a62c45668f85047b355b1b47"; // <-- KEY IS CORRECTLY PLACED HERE

async function fetchDeepSeekSummary(text) {
  // This if condition now correctly checks if the KEY was NOT replaced from the placeholder.
  // If DEEPSEEK_API_KEY is your actual key, the second part of OR (DEEPSEEK_API_KEY === "YOUR_DEEPSEEK_API_KEY_HERE") will be false.
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY.startsWith("sk-") === false) { 
    console.warn("DeepSeek API Key not configured or is invalid. It should start with 'sk-'. Returning mock summary.");
    return "[DeepSeek API 密钥似乎未正确配置或无效 - 返回模拟总结]: " + text.substring(0, 70) + "...";
  }

  const apiUrl = "https://api.deepseek.com/chat/completions";
  const prompt = `请帮我简明扼要地总结以下文本内容，专注于核心观点，字数控制在100字以内：\n\n${text}`;

  const payload = {
    model: "deepseek-chat",
    messages: [
      { role: "user", content: prompt }
    ],
  };

  console.log("Fetching DeepSeek summary for:", text.substring(0, 50) + "...");

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})); 
      throw new Error(`API request failed with status ${response.status}: ${response.statusText}. Details: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();

    if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
      return data.choices[0].message.content.trim();
    } else {
      console.error("Unexpected response structure from DeepSeek API:", data);
      throw new Error("未能从API响应中找到总结内容。");
    }
  } catch (error) {
    console.error("DeepSeek Summary API error:", error);
    return `[总结失败: ${error.message}]`;
  }
}

// Ensure DEEPSEEK_API_KEY is defined
// const DEEPSEEK_API_KEY = "YOUR_API_KEY"; // Replace with your actual key if not already done

// Function to handle showing result modal (extracted for reusability)
async function showOperationResult(tabId, operationType, originalText, processedText, isError = false) {
  let modalTitle;
  if (isError) {
    modalTitle = operationType === 'translation' ? "翻译失败" : "总结失败";
  } else {
    modalTitle = operationType === 'translation' ? "翻译结果" : "总结结果";
  }
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "showResultModal",
      modalTitle: modalTitle,
      originalText: originalText,
      processedText: processedText,
      isError: isError,
      operationType: operationType
    });
  } catch (error) {
    console.error("Error sending message to content script:", error, "Tab ID:", tabId);
    // Fallback notification if content script is not available or fails
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: modalTitle,
      message: isError ? processedText : `原文: ${originalText.substring(0, 30)}...
${operationType === 'translation' ? '译文' : '总结'}: ${processedText.substring(0, 50)}...`
    });
  }
}

// --- REVISED Message Listener for POPUP and CONTENT SCRIPT (Floating Menu) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    let tabIdToRespond = sender.tab ? sender.tab.id : null;
    // If message is from popup and doesn't have tab context, try to get active tab.
    if (!tabIdToRespond && sender.origin && sender.origin.startsWith(chrome.runtime.getURL(''))) { // Check if from extension
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) tabIdToRespond = activeTab.id;
    }

    if (!tabIdToRespond && (request.type === "translateText" || request.type === "summarizeText" || request.type === "addWordToVocab")) {
        console.error("BG: Could not determine tab ID to respond for content script message type:", request.type);
        sendResponse({ status: "error", message: "Could not determine target tab." });
        return; // Important to return here
    }

    // Handling for messages from Floating Menu (content.js)
    if (request.type === "translateText" && request.text && request.source === "floatingMenu") {
      console.log("BG: Received translateText from floating menu:", request.text);
      const translationResult = await fetchRealTranslation(request.text);
      if (translationResult && !translationResult.startsWith("[翻译失败")) {
        showOperationResult(tabIdToRespond, 'translation', request.text, translationResult);
        await addUsageRecord("translate_float_menu", request.text.substring(0,100));
        sendResponse({status: "translation_processed"});
      } else {
        showOperationResult(tabIdToRespond, 'translation', request.text, translationResult || "翻译API未返回结果", true);
        await addUsageRecord("translate_float_menu_fail", request.text.substring(0,100));
        sendResponse({status: "error", message: translationResult});
      }
    } else if (request.type === "summarizeText" && request.text && request.source === "floatingMenu") {
      console.log("BG: Received summarizeText from floating menu:", request.text);
      const summaryResult = await fetchDeepSeekSummary(request.text);
      if (summaryResult && !summaryResult.startsWith("[总结失败") && !summaryResult.startsWith("[DeepSeek API 密钥")) {
        showOperationResult(tabIdToRespond, 'summary', request.text, summaryResult);
        await addUsageRecord("summarize_float_menu", request.text.substring(0,100));
        sendResponse({status: "summary_processed"});
      } else {
        showOperationResult(tabIdToRespond, 'summary', request.text, summaryResult || "总结API未返回结果", true);
        await addUsageRecord("summarize_float_menu_fail", request.text.substring(0,100));
        sendResponse({status: "error", message: summaryResult});
      }
    } else if (request.type === "addWordToVocab" && request.text && request.source === "floatingMenu") {
      console.log("BG: Received addWordToVocab from floating menu:", request.text);
      const addResult = await addVocabularyWord(request.text.trim());
      if (addResult === null) {
        showOperationResult(tabIdToRespond, 'addWord', request.text, `单词 '${request.text.trim()}' 已存在`, false); // Show info as non-error
        sendResponse({status: "exists"});
      } else if (addResult) {
        showOperationResult(tabIdToRespond, 'addWord', request.text, `单词 '${request.text.trim()}' 已添加!`, false);
        await addUsageRecord("addWord_float_menu", request.text.trim().substring(0,100));
        sendResponse({status: "success"});
      } else {
        showOperationResult(tabIdToRespond, 'addWord', request.text, "添加单词失败 (数据库错误)", true);
        sendResponse({status: "error"});
      }
    }
    // Handling for messages from POPUP (original logic adapted)
    else if (request.type === "popup_翻译" && request.text) {
      const originalText = request.text;
      const translatedText = await fetchRealTranslation(originalText);
      let responseStatus = 'success';
      let responseMessage = translatedText;
      let opDataForPopup = null;

      if (translatedText && !translatedText.startsWith("[翻译失败")) {
        opDataForPopup = { type: "翻译 (Popup)", originalText: originalText.substring(0, 100), resultText: translatedText, timestamp: new Date().toISOString() };
      } else {
        responseStatus = 'error';
        responseMessage = translatedText || "未能获取翻译结果。";
      }
      if (opDataForPopup) chrome.storage.local.set({ lastOperation: opDataForPopup });
      await addUsageRecord("translate_popup", originalText.substring(0, 100));
      sendResponse({ status: responseStatus, message: responseMessage, data: opDataForPopup });
      // Optionally, also show modal from popup translation if tabId is known
      if (tabIdToRespond) showOperationResult(tabIdToRespond, 'translation', originalText, responseMessage, responseStatus === 'error');

    } else if (request.type === "popup_总结" && request.text) {
      const originalText = request.text;
      const summarizedText = await fetchDeepSeekSummary(originalText); 
      let opDataForPopup = null;
      let responseStatus = 'success';
      let responseMessage = summarizedText;

      if (summarizedText && !summarizedText.startsWith("[总结失败") && !summarizedText.startsWith("[DeepSeek API 密钥")) {
        opDataForPopup = { type: "总结 (DeepSeek/Popup)", originalText: originalText.substring(0, 100), resultText: summarizedText, timestamp: new Date().toISOString() };
      } else {
         responseStatus = 'error';
         responseMessage = summarizedText || "未能获取总结结果。";
      }
      if (opDataForPopup) chrome.storage.local.set({ lastOperation: opDataForPopup });
      await addUsageRecord("summarize_deepseek_popup", originalText.substring(0, 100));
      sendResponse({ status: responseStatus, message: responseMessage, data: opDataForPopup });
      if (tabIdToRespond) showOperationResult(tabIdToRespond, 'summary', originalText, responseMessage, responseStatus === 'error');

    } else if (request.type === "popup_addWord" && request.text) {
      const wordToAdd = request.text.trim();
      const addResult = await addVocabularyWord(wordToAdd);
      if (addResult === null) {
        sendResponse({ status: 'exists', message: `单词 '${wordToAdd}' 已存在。` });
      } else if (addResult) {
        await addUsageRecord("addWord_popup", wordToAdd);
        sendResponse({ status: 'success', message: `单词 '${wordToAdd}' 已添加。` });
      } else {
        sendResponse({ status: 'error', message: '添加单词时发生未知错误。' });
      }
    } else if (request.type === "getWordsForReview") {
      console.log("BG: Received getWordsForReview request from popup");
      const words = await getWordsForReview(request.limit || 5); // Default to 5 words
      sendResponse({ status: "success", words: words });
    } else if (request.type === "updateWordReview" && request.word && request.feedback) {
      console.log(`BG: Received updateWordReview for '${request.word}', feedback: ${request.feedback}`);
      try {
        const updatedWord = await updateWordReviewStatus(request.word, request.feedback);
        sendResponse({ status: "success", updatedWord: updatedWord });
      } catch (error) {
        console.error("BG: Failed to update word review:", error);
        sendResponse({ status: "error", message: error.toString() });
      }
    } else {
      // If the message type is not recognized by this async IIFE, 
      // and not handled by other potential synchronous listeners outside this IIFE,
      // you might want to send a generic response or log it.
      // However, to prevent "message port closed before a response was received" errors,
      // only call sendResponse if you intend to handle this specific message type.
      // If this is the *only* listener, unknown types will just be ignored by this part.
      // console.log("BG: Unhandled message type or no async action taken:", request.type);
    }
  })();
  return true; // Crucial for asynchronous sendResponse
});

// --- REVISED Context Menu Click Handling ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) {
    console.error("BG: Tab information is missing for context menu action.");
    // Attempt to get current active tab as a fallback
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
        console.error("BG: Could not determine active tab for context menu action.");
        return;
    }
    tab = activeTab; // Use active tab if original tab info was insufficient
  }

  const selection = info.selectionText;
  let lastOpData = null; // For chrome.storage.local.set({ lastOperation: ...});

  if (info.menuItemId === "copyText" && selection) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: copyToClipboard, // Assumes copyToClipboard is defined elsewhere in your BG script
        args: [selection]
      });
      console.log("BG: Text copied via context menu.");
      await addUsageRecord("copy_context_menu", selection.substring(0, 100));
      // No modal for copy, but maybe a small, temporary notification if desired (not implemented here)
    } catch (err) {
      console.error("BG: Copying failed via context menu:", err);
    }
  } else if (info.menuItemId === "translateText" && selection) {
    console.log("BG: Context menu translate triggered for:", selection.substring(0,50));
    const translatedText = await fetchRealTranslation(selection);
    if (translatedText && !translatedText.startsWith("[翻译失败")) {
      showOperationResult(tab.id, 'translation', selection, translatedText);
      lastOpData = { type: "翻译 (ContextMenu)", originalText: selection.substring(0, 100), resultText: translatedText, timestamp: new Date().toISOString() };
      await addUsageRecord("translate_context_menu", selection.substring(0,100));
    } else {
      showOperationResult(tab.id, 'translation', selection, translatedText || "翻译API未返回结果", true);
      await addUsageRecord("translate_context_menu_fail", selection.substring(0,100));
    }
  } else if (info.menuItemId === "summarizeText" && selection) {
    console.log("BG: Context menu summarize triggered for:", selection.substring(0,50));
    const summarizedText = await fetchDeepSeekSummary(selection);
    if (summarizedText && !summarizedText.startsWith("[总结失败") && !summarizedText.startsWith("[DeepSeek API 密钥")) {
      showOperationResult(tab.id, 'summary', selection, summarizedText);
      lastOpData = { type: "总结 (ContextMenu)", originalText: selection.substring(0, 100), resultText: summarizedText, timestamp: new Date().toISOString() };
      await addUsageRecord("summarize_context_menu", selection.substring(0,100));
    } else {
      showOperationResult(tab.id, 'summary', selection, summarizedText || "总结API未返回结果", true);
      await addUsageRecord("summarize_context_menu_fail", selection.substring(0,100));
    }
  } else if (info.menuItemId === "addWord" && selection) {
    console.log("BG: Context menu addWord triggered for:", selection.trim());
    const wordToAdd = selection.trim();
    const addResult = await addVocabularyWord(wordToAdd);
    if (addResult === null) {
      showOperationResult(tab.id, 'addWord', wordToAdd, `单词 '${wordToAdd}' 已存在.`, false); // Non-error info
    } else if (addResult) {
      showOperationResult(tab.id, 'addWord', wordToAdd, `单词 '${wordToAdd}' 已添加!`, false);
      lastOpData = { type: "记单词 (ContextMenu)", originalText: wordToAdd, resultText: "已添加", timestamp: new Date().toISOString() };
      await addUsageRecord("addWord_context_menu", wordToAdd.substring(0,100));
    } else {
      showOperationResult(tab.id, 'addWord', wordToAdd, "添加单词失败 (数据库错误).", true);
    }
  }

  if (lastOpData) {
    chrome.storage.local.set({ lastOperation: lastOpData }, () => {
      console.log("BG: Last context menu operation saved: ", lastOpData.type);
    });
  }
});

console.log("智能网页助手 background script fully loaded and listeners attached.");

async function getWordsForReview(limit = 5) {
  if (!db) {
    console.error("BG: Database not initialized for getWordsForReview.");
    await initDB();
    if(!db) return Promise.resolve([]); // Resolve with empty array on DB fail
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_VOCABULARY], 'readonly');
    const store = transaction.objectStore(STORE_VOCABULARY);
    const allEligibleWords = [];
    const nowISO = new Date().toISOString();

    // Ideally, use an index on nextReviewDate for performance if dataset grows large.
    // For now, iterate and filter.
    const request = store.openCursor(); 

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const word = cursor.value;
        // Check if nextReviewDate is today or in the past
        if (word.nextReviewDate && word.nextReviewDate <= nowISO) {
          allEligibleWords.push(word);
        }
        cursor.continue();
      } else {
        // Sort due words by their nextReviewDate (earliest first)
        allEligibleWords.sort((a, b) => new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime());
        
        // If not enough due words, we could fetch some new/least reviewed words as a secondary strategy
        // For now, just return the due words up to the limit
        resolve(allEligibleWords.slice(0, limit));
      }
    };
    request.onerror = (event) => {
      console.error("BG: Error fetching words for review with cursor:", event.target.error);
      reject(event.target.error);
    };
  });
}

async function updateWordReviewStatus(word, feedback) {
  if (!db) {
    console.error("BG: Database not initialized for updateWordReviewStatus.");
    await initDB();
    if(!db) return Promise.reject("DB not initialized after attempt.");
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_VOCABULARY], 'readwrite');
    const store = transaction.objectStore(STORE_VOCABULARY);
    const getRequest = store.get(word);

    getRequest.onsuccess = (event) => {
      let record = event.target.result;
      if (record) {
        record.reviewCount = (record.reviewCount || 0) + 1;
        record.lastReviewDate = new Date().toISOString();

        // Simplified SM2-like logic for interval calculation
        // Feedback quality: hard (0-2), medium (3), easy (4-5)
        // For simplicity, map our buttons: hard -> q=0, medium -> q=3, easy -> q=5
        let quality = 0;
        if (feedback === 'easy') quality = 5;
        else if (feedback === 'medium') quality = 3;
        else if (feedback === 'hard') quality = 0;

        if (quality < 3) { // Failed recall (hard)
          record.interval = 1; // Reset interval to 1 day (or 0 for same day, but 1 is simpler for next day)
          record.consecutiveCorrectAnswers = 0;
        } else { // Correct recall (medium or easy)
          record.consecutiveCorrectAnswers = (record.consecutiveCorrectAnswers || 0) + 1;
          if (record.interval === 0) { // First review after learning
            record.interval = 1;
          } else if (record.interval === 1 && record.consecutiveCorrectAnswers <= 1) { // Second review (was new or failed last time)
            record.interval = 6;
          } else {
            record.interval = Math.ceil(record.interval * record.easinessFactor);
          }
        }

        // Update easiness factor (EF)
        // EF' = EF + [0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)]
        // Clamp EF between 1.3 and 2.5
        record.easinessFactor = record.easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        if (record.easinessFactor < 1.3) record.easinessFactor = 1.3;
        if (record.easinessFactor > 2.5) record.easinessFactor = 2.5; // Cap EF at 2.5 or allow it to grow?
                                                                  // Standard SM2 usually doesn't cap EF this low, but for simplicity we can.

        // Ensure interval is at least 1 day
        if (record.interval < 1) record.interval = 1;
        // Max interval (e.g., 1 year)
        // if (record.interval > 365) record.interval = 365;

        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + record.interval);
        record.nextReviewDate = nextReview.toISOString();

        const updateRequest = store.put(record);
        updateRequest.onsuccess = () => {
          console.log(`BG: Word '${word}' SRS updated. Interval: ${record.interval}d, EF: ${record.easinessFactor.toFixed(2)}, Next: ${record.nextReviewDate}`);
          resolve(record);
        };
        updateRequest.onerror = (event) => {
          console.error("BG: Error updating word SRS data:", event.target.error);
          reject(event.target.error);
        };
      } else {
        console.warn(`BG: Word '${word}' not found for review update.`);
        reject("Word not found");
      }
    };
    getRequest.onerror = (event) => {
      console.error("BG: Error fetching word for review update:", event.target.error);
      reject(event.target.error);
    };
  });
} 