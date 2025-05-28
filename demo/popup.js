document.addEventListener('DOMContentLoaded', () => {
  const openOptionsButton = document.getElementById('openOptionsPage');
  const lastOpSection = document.getElementById('lastOperationSection');
  const lastOpTypeEl = document.getElementById('lastOpType');
  const lastOpOriginalEl = document.getElementById('lastOpOriginal');
  const lastOpResultEl = document.getElementById('lastOpResultText');

  const quickActionTextarea = document.getElementById('quickActionTextarea');
  const quickTranslateBtn = document.getElementById('quickTranslateBtn');
  const quickSummarizeBtn = document.getElementById('quickSummarizeBtn');
  const popupStatusEl = document.getElementById('popupStatus');

  const addWordInput = document.getElementById('addWordInput');
  const addWordBtn = document.getElementById('addWordBtn');
  const addWordStatusEl = document.getElementById('addWordStatus');

  const startReviewBtn = document.getElementById('startReviewBtn');
  const wordCardDiv = document.getElementById('wordCard');
  const reviewWordEl = document.getElementById('reviewWord');
  const showAnswerBtn = document.getElementById('showAnswerBtn');
  const reviewAnswerDiv = document.getElementById('reviewAnswer');
  const reviewDefinitionEl = document.getElementById('reviewDefinition');
  const reviewExampleEl = document.getElementById('reviewExample');
  const reviewAddedDateEl = document.getElementById('reviewAddedDate');
  const reviewCountEl = document.getElementById('reviewCount');
  const reviewFeedbackBtnsDiv = document.getElementById('reviewFeedbackBtns');
  const noWordsToReviewMsg = document.getElementById('noWordsToReview');

  // Data Management Elements
  const dataManagementSection = document.getElementById('dataManagementSection');
  const dataTextArea = document.getElementById('dataTextArea');
  const saveDataBtn = document.getElementById('saveDataBtn');
  const importFile = document.getElementById('importFile');
  const importDataBtn = document.getElementById('importDataBtn');
  const dataManagementStatus = document.getElementById('dataManagementStatus');

  let currentReviewWords = [];
  let currentWordIndex = -1;
  let currentWordData = null;

  function displayLastOperation(opData) {
    if (opData && lastOpSection && lastOpTypeEl && lastOpOriginalEl && lastOpResultEl) {
      lastOpTypeEl.textContent = opData.type || 'N/A';
      lastOpOriginalEl.textContent = opData.originalText || 'N/A';
      lastOpResultEl.textContent = opData.resultText || 'N/A';
      lastOpSection.style.display = 'block';
    }
  }

  // Load and display last operation from storage on popup open
  chrome.storage.local.get('lastOperation', (data) => {
    if (data.lastOperation) {
      displayLastOperation(data.lastOperation);
    }
  });

  function handleQuickAction(actionType) {
    const text = quickActionTextarea.value.trim();
    if (!text) {
      popupStatusEl.textContent = '请输入文本后再操作。';
      popupStatusEl.className = 'status-info';
      setTimeout(() => { popupStatusEl.textContent = ''; popupStatusEl.className = ''; }, 3000);
      return;
    }
    popupStatusEl.textContent = `正在${actionType}...`;
    popupStatusEl.className = 'status-info';

    chrome.runtime.sendMessage({ type: `popup_${actionType}`, text: text }, (response) => {
      if (chrome.runtime.lastError) {
        popupStatusEl.textContent = `错误: ${chrome.runtime.lastError.message}`;
        popupStatusEl.className = 'status-error';
        console.error(chrome.runtime.lastError.message);
        setTimeout(() => { popupStatusEl.textContent = ''; popupStatusEl.className = ''; }, 3000);
        return;
      }
      if (response && response.status === 'success') {
        popupStatusEl.textContent = `${actionType}完成。`;
        popupStatusEl.className = 'status-success';
        quickActionTextarea.value = ''; // Clear textarea after success
        if(response.data) {
            displayLastOperation(response.data); // Update the last operation display
        }
      } else if (response && response.status === 'error') {
        popupStatusEl.textContent = `错误: ${response.message}`;
        popupStatusEl.className = 'status-error';
      } else {
        popupStatusEl.textContent = '未知响应或发生错误。';
        popupStatusEl.className = 'status-info';
      }
      setTimeout(() => { popupStatusEl.textContent = ''; popupStatusEl.className = ''; }, 3000);
    });
  }

  if (quickTranslateBtn) {
    quickTranslateBtn.addEventListener('click', () => handleQuickAction('翻译'));
  }

  if (quickSummarizeBtn) {
    quickSummarizeBtn.addEventListener('click', () => handleQuickAction('总结'));
  }

  if (addWordBtn) {
    addWordBtn.addEventListener('click', () => {
      const word = addWordInput.value.trim();
      if (!word) {
        addWordStatusEl.textContent = '请输入单词。';
        addWordStatusEl.className = 'status-info';
        setTimeout(() => { addWordStatusEl.textContent = ''; addWordStatusEl.className = ''; }, 3000);
        return;
      }
      addWordStatusEl.textContent = '正在添加...';
      addWordStatusEl.className = 'status-info';
      chrome.runtime.sendMessage({ type: "popup_addWord", text: word }, (response) => {
        if (chrome.runtime.lastError) {
          addWordStatusEl.textContent = `错误: ${chrome.runtime.lastError.message}`;
          addWordStatusEl.className = 'status-error';
          console.error(chrome.runtime.lastError.message);
          setTimeout(() => { addWordStatusEl.textContent = ''; addWordStatusEl.className = ''; }, 3000);
          return;
        }
        if (response && response.status === 'success') {
          addWordStatusEl.textContent = `'${word.substring(0,20)}...' 已添加!`;
          addWordStatusEl.className = 'status-success';
          addWordInput.value = ''; // Clear input
        } else if (response && response.status === 'exists') {
          addWordStatusEl.textContent = `'${word.substring(0,20)}...' 已存在。`;
          addWordStatusEl.className = 'status-info';
        } else if (response && response.status === 'error') {
          addWordStatusEl.textContent = `添加失败: ${response.message}`;
          addWordStatusEl.className = 'status-error';
        } else {
          addWordStatusEl.textContent = '未知响应或发生错误。';
          addWordStatusEl.className = 'status-info';
        }
        // Clear status message after a few seconds
        setTimeout(() => { addWordStatusEl.textContent = ''; addWordStatusEl.className = ''; }, 3000);
      });
    });
  }

  if (openOptionsButton) {
    openOptionsButton.addEventListener('click', (event) => {
      event.preventDefault(); 
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL('options.html'));
      }
      window.close(); 
    });
  }

  async function fetchAndDisplayWord() {
    if (currentWordIndex === -1 || currentWordIndex >= currentReviewWords.length) {
      // Fetch new batch of words
      try {
        const response = await chrome.runtime.sendMessage({ type: "getWordsForReview", limit: 5 });
        if (response && response.status === 'success' && response.words && response.words.length > 0) {
          currentReviewWords = response.words;
          currentWordIndex = 0;
          noWordsToReviewMsg.style.display = 'none';
          wordCardDiv.style.display = 'block';
        } else {
          currentReviewWords = [];
          currentWordIndex = -1;
          wordCardDiv.style.display = 'none';
          noWordsToReviewMsg.style.display = 'block';
          noWordsToReviewMsg.textContent = (response && response.status === 'empty') ? '太棒了！当前没有需要复习的单词。' : '获取单词失败或列表为空。';
          noWordsToReviewMsg.className = (response && response.status === 'empty') ? 'status-success' : 'status-info';
          if (response && response.status === 'error') {
            console.error("Error fetching words:", response.message);
            noWordsToReviewMsg.textContent = `获取单词错误: ${response.message}`;
            noWordsToReviewMsg.className = 'status-error';
          }
          return false; // No words or error
        }
      } catch (error) {
        console.error("Error sending message to get words:", error);
        wordCardDiv.style.display = 'none';
        noWordsToReviewMsg.style.display = 'block';
        noWordsToReviewMsg.textContent = '获取复习单词失败，请稍后再试。';
        noWordsToReviewMsg.className = 'status-error';
        return false;
      }
    }

    currentWordData = currentReviewWords[currentWordIndex];
    reviewWordEl.textContent = currentWordData.word;
    reviewDefinitionEl.textContent = currentWordData.definition || '-';
    reviewExampleEl.textContent = currentWordData.exampleSentence || '-';
    reviewAddedDateEl.textContent = currentWordData.addedDate ? new Date(currentWordData.addedDate).toLocaleDateString() : '-';
    reviewCountEl.textContent = currentWordData.reviewCount || 0;

    // --- ADDED/MODIFIED FOR NEXT REVIEW DATE DISPLAY ---
    let nextReviewText = '-';
    if (currentWordData.nextReviewDate) {
        const nextDate = new Date(currentWordData.nextReviewDate);
        const today = new Date();
        today.setHours(0,0,0,0); // Compare dates only
        const nextReviewDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());

        const diffTime = Math.abs(nextReviewDay - today);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (nextReviewDay < today) {
            nextReviewText = `已过期 ${diffDays} 天 (应于 ${nextDate.toLocaleDateString()})`;
        } else if (nextReviewDay.getTime() === today.getTime()) {
            nextReviewText = `今天 (间隔: ${currentWordData.interval || 'N/A'}天)`;
        } else {
            nextReviewText = `${nextDate.toLocaleDateString()} (还有 ${diffDays} 天, 当前间隔: ${currentWordData.interval || 'N/A'}天)`;
        }
    }
    // Assuming you add an element in popup.html like: <p>下次复习: <span id="reviewNextDate">-</span></p>
    // For now, I'll append it to the existing reviewCountEl's parent or log it.
    // Let's find the p tag holding addedDate and count, and add it there.
    const detailParagraph = reviewAddedDateEl.parentNode;
    let nextReviewP = detailParagraph.querySelector('.next-review-info');
    if (!nextReviewP) {
        nextReviewP = document.createElement('p');
        nextReviewP.className = 'next-review-info';
        nextReviewP.style.fontSize = "0.8em";
        nextReviewP.style.color = "#666";
        detailParagraph.parentNode.insertBefore(nextReviewP, detailParagraph.nextSibling); // Insert after the details <p>
    }
    nextReviewP.innerHTML = `下次复习: ${nextReviewText} | EF: ${(currentWordData.easinessFactor || 2.5).toFixed(2)}`;
    // --- END OF ADDED/MODIFIED SECTION ---

    reviewAnswerDiv.style.display = 'none';
    reviewFeedbackBtnsDiv.style.display = 'none';
    showAnswerBtn.style.display = 'inline-block';
    showAnswerBtn.disabled = false;
    return true; // Word displayed
  }

  if (startReviewBtn) {
    startReviewBtn.addEventListener('click', async () => {
      // If current word card is visible and answer not shown, show answer first?
      // Or directly fetch next. For now, directly fetch/display next.
      currentWordIndex++; // Move to next word in current batch, or trigger fetch for new batch
      await fetchAndDisplayWord();
    });
  }

  if (showAnswerBtn) {
    showAnswerBtn.addEventListener('click', () => {
      reviewAnswerDiv.style.display = 'block';
      reviewFeedbackBtnsDiv.style.display = 'block';
      showAnswerBtn.style.display = 'none'; // Hide show answer button
    });
  }

  if (reviewFeedbackBtnsDiv) {
    reviewFeedbackBtnsDiv.addEventListener('click', async (event) => {
      if (event.target.tagName === 'BUTTON' && currentWordData) {
        const feedback = event.target.dataset.feedback;
        showAnswerBtn.disabled = true; // Prevent clicking while processing
        try {
          await chrome.runtime.sendMessage({
            type: "updateWordReview",
            word: currentWordData.word,
            feedback: feedback
          });
          // Optionally, update UI immediately based on feedback, or just fetch next word
          console.log(`Feedback ${feedback} for ${currentWordData.word} sent.`);
        } catch (error) {
          console.error("Error sending review feedback:", error);
          // Handle error - maybe show a message to user
        }
        // Proceed to next word automatically
        currentWordIndex++;
        await fetchAndDisplayWord();
      }
    });
  }
  
  // Initial state: maybe show a prompt to start, or auto-load first word if settings allow
  // For now, user must click "start review"
  
  // --- Data Management Logic ---
  function loadVocabularyData() {
    if (!dataTextArea || !dataManagementStatus) return;

    dataManagementStatus.textContent = '正在加载数据...';
    dataManagementStatus.className = 'status-info';
    chrome.runtime.sendMessage({ type: "getAllVocabulary" }, (response) => {
      if (chrome.runtime.lastError) {
        dataManagementStatus.textContent = `加载错误: ${chrome.runtime.lastError.message}`;
        dataManagementStatus.className = 'status-error';
        console.error(chrome.runtime.lastError.message);
        return;
      }
      if (response && response.status === 'success' && response.data) {
        try {
          dataTextArea.value = JSON.stringify(response.data, null, 2); // Pretty print JSON
          dataManagementStatus.textContent = `数据已加载 (${response.data.length} 条记录)。`;
          dataManagementStatus.className = 'status-success';
        } catch (e) {
          dataTextArea.value = "Error displaying data.";
          dataManagementStatus.textContent = '数据加载成功，但显示时出错。';
          dataManagementStatus.className = 'status-error';
          console.error("Error stringifying vocabulary data: ", e);
        }
      } else if (response && response.status === 'empty'){
        dataTextArea.value = '[]'; // Empty array for no data
        dataManagementStatus.textContent = '单词本为空。';
        dataManagementStatus.className = 'status-info';
      } else if (response && response.status === 'error') {
        dataManagementStatus.textContent = `加载错误: ${response.message}`;
        dataManagementStatus.className = 'status-error';
        console.error("Error loading vocabulary from background: ", response.message);
      } else {
        dataManagementStatus.textContent = '加载数据时收到未知响应。';
        dataManagementStatus.className = 'status-info';
        console.error("Unknown response when loading vocabulary: ", response);
      }
    });
  }

  // Load data when popup opens
  if(dataManagementSection) { // only if the section is present
    loadVocabularyData();

    saveDataBtn.addEventListener('click', () => {
      if (!dataTextArea || !dataManagementStatus) return;
      const rawData = dataTextArea.value;
      let vocabularyArray;
      try {
        vocabularyArray = JSON.parse(rawData);
        if (!Array.isArray(vocabularyArray)) {
          throw new Error("数据格式不是一个有效的JSON数组。");
        }
        // 可选：在这里添加更详细的单条数据验证逻辑
        // 例如，检查每个对象是否包含必要的字段 (word, addedDate etc.)
      } catch (e) {
        dataManagementStatus.textContent = `保存失败: ${e.message}`;
        dataManagementStatus.className = 'status-error';
        console.error("Error parsing data for save: ", e);
        return;
      }

      dataManagementStatus.textContent = '正在保存数据...';
      dataManagementStatus.className = 'status-info';
      chrome.runtime.sendMessage({ type: "replaceAllVocabulary", data: vocabularyArray }, (response) => {
        if (chrome.runtime.lastError) {
          dataManagementStatus.textContent = `保存错误: ${chrome.runtime.lastError.message}`;
          dataManagementStatus.className = 'status-error';
          console.error(chrome.runtime.lastError.message);
          return;
        }
        if (response && response.status === 'success') {
          dataManagementStatus.textContent = `数据已成功保存 (${vocabularyArray.length} 条记录)。`;
          dataManagementStatus.className = 'status-success';
          // 重新加载单词复习部分的数据，如果它已初始化
          if (wordCardDiv && typeof fetchAndDisplayWord === 'function') {
            currentReviewWords = []; // 清空当前批次
            currentWordIndex = -1;   // 重置索引
            fetchAndDisplayWord(); // 重新获取复习单词
          }
        } else if (response && response.status === 'error') {
          dataManagementStatus.textContent = `保存错误: ${response.message}`;
          dataManagementStatus.className = 'status-error';
          console.error("Error saving vocabulary from background: ", response.message);
        } else {
          dataManagementStatus.textContent = '保存数据时收到未知响应。';
          dataManagementStatus.className = 'status-info';
          console.error("Unknown response when saving vocabulary: ", response);
        }
      });
    });

    importDataBtn.addEventListener('click', () => {
      if (!importFile || !importFile.files || importFile.files.length === 0) {
        dataManagementStatus.textContent = '请先选择一个JSON文件进行导入。';
        dataManagementStatus.className = 'status-info';
        setTimeout(() => { dataManagementStatus.textContent = ''; dataManagementStatus.className = ''; }, 3000);
        return;
      }
      const file = importFile.files[0];
      if (file.type !== "application/json") {
        dataManagementStatus.textContent = '导入失败: 请选择 .json 文件。';
        dataManagementStatus.className = 'status-error';
        setTimeout(() => { dataManagementStatus.textContent = ''; dataManagementStatus.className = ''; }, 3000);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const fileContent = event.target.result;
        let vocabularyArray;
        try {
          vocabularyArray = JSON.parse(fileContent);
          if (!Array.isArray(vocabularyArray)) {
            throw new Error("文件内容不是一个有效的JSON数组。");
          }
          // 可选：在这里添加更详细的单条数据验证逻辑
        } catch (e) {
          dataManagementStatus.textContent = `导入失败: ${e.message}`;
          dataManagementStatus.className = 'status-error';
          console.error("Error parsing imported file: ", e);
          setTimeout(() => { dataManagementStatus.textContent = ''; dataManagementStatus.className = ''; }, 3000);
          return;
        }

        dataManagementStatus.textContent = '正在导入数据...';
        dataManagementStatus.className = 'status-info';
        chrome.runtime.sendMessage({ type: "replaceAllVocabulary", data: vocabularyArray }, (response) => {
          if (chrome.runtime.lastError) {
            dataManagementStatus.textContent = `导入错误: ${chrome.runtime.lastError.message}`;
            dataManagementStatus.className = 'status-error';
            console.error(chrome.runtime.lastError.message);
            setTimeout(() => { dataManagementStatus.textContent = ''; dataManagementStatus.className = ''; }, 3000);
            return;
          }
          if (response && response.status === 'success') {
            dataManagementStatus.textContent = `数据已成功从 '${file.name}' 导入 (${vocabularyArray.length} 条记录)。`;
            dataTextArea.value = JSON.stringify(vocabularyArray, null, 2); // 更新textarea显示
            importFile.value = ''; // 清空文件选择
            dataManagementStatus.className = 'status-success';
            // 重新加载单词复习部分的数据
            if (wordCardDiv && typeof fetchAndDisplayWord === 'function') {
              currentReviewWords = [];
              currentWordIndex = -1;
              fetchAndDisplayWord();
            }
          } else if (response && response.status === 'error') {
            dataManagementStatus.textContent = `导入错误: ${response.message}`;
            dataManagementStatus.className = 'status-error';
            console.error("Error importing vocabulary from background: ", response.message);
          } else {
            dataManagementStatus.textContent = '导入数据时收到未知响应。';
            dataManagementStatus.className = 'status-info';
            console.error("Unknown response when importing vocabulary: ", response);
          }
          setTimeout(() => { dataManagementStatus.textContent = ''; dataManagementStatus.className = ''; }, 3000);
        });
      };
      reader.onerror = (event) => {
        dataManagementStatus.textContent = '读取文件失败。';
        dataManagementStatus.className = 'status-error';
        console.error("Error reading file: ", event.target.error);
        setTimeout(() => { dataManagementStatus.textContent = ''; dataManagementStatus.className = ''; }, 3000);
      };
      reader.readAsText(file);
    });
  }
}); 