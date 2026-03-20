// 立即执行函数，避免全局变量污染
(function () {
  // 检查脚本是否已经加载过
  if (window.AIBOT_IFRAME_LOADED && window.AIBotChatInstance) {
    return;
  }
  
  // 标记脚本已加载
  window.AIBOT_IFRAME_LOADED = true;

  // jQuery 环境检测和自动引入
  function ensureJQuery(callback) {
    // 检查 jQuery 是否已存在
    if (window.$ && window.$.post) {
      callback();
      return;
    }
    // 创建 script 标签加载 jQuery
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js';
    script.onload = function() {
      callback();
    };
    script.onerror = function() {
      console.error('jQuery CDN 加载失败，请检查网络连接');
    };
    document.head.appendChild(script);
  }

  // 主要初始化函数
  function initializeAIBot() {
    // 检查是否已存在实例，避免重复加载
    if (window.AIBotChatInstance) {
      return;
    }
  
  // 获取script标签及配置属性
  const scriptElement = document.getElementById('chatbot-iframe-script');
  const aiagentBaseurl = scriptElement.getAttribute('aiagent_baseuri');
  const containerSelector = scriptElement.getAttribute('container');
  const position = scriptElement.getAttribute('position') || 'bottom';

  // 通用参数
  const appid = scriptElement.getAttribute('appid');

  // Guest模式参数
  const appkey = scriptElement.getAttribute('appkey');
  const userWorkcode = scriptElement.getAttribute('user_workcode');
  const userName = scriptElement.getAttribute('user_name');
  const userCompany = scriptElement.getAttribute('user_company');
  const userEmail = scriptElement.getAttribute('user_email');

  // API模式参数
  const chatInitPath = scriptElement.getAttribute('chat_init_path');
  const renewTokenPath = scriptElement.getAttribute('renew_token_path');
  const appInstance = scriptElement.getAttribute('app_instance');

  // 常量定义
  const CONSTANTS = {
    aiImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAdrSURBVFhHzZd7cFTVHcfvTMsfzkBMSAiPEAKBQEhieAQrU1v9g1qqnbGU1gJJNrsJZPMg73eq5RWKLY6PAKUzFTWxdBBLlVHpw9G2o9ihtWhboA+wVEEQee3u3d1799699346Zzdr9u6GGPtHyZn5zL17fq/v75x77u5KSgh6fgaLu2BpN9zee/MpaoeV2+F3J0Hq2Q93bx4/4gTLeqGkB9Y8DtLizvElLsayHijuBGk8ioshVlFKnBxvjH+BYq/HM1JJt8XNYJmgZ4gR7DFumsClXRZLBCPY4pGWdpn8LyzpMinuMFmUwJLOZF8b3SZF7Sbzm03ymqLXoraorSTRt8tEEoU+K0LIgmaTeQ3J5DWa3NaeHCMQBQtao/fr+k06njWp/JHJ7d0mhS3DjccjiY4/C6J4fovJV/tMmp4yaX/WpGXApHXQpHXAZPVOk+K2IZEJsQVCRKfJwy9anPnIImzAhWvw6EsWJT0mC4fs8THS4g6DsbCow6C4zWBOvcHK7Qa/esfEG7QIhCx8ioVfoFocf8+iYrdBXpNBcftwvLjPbTCo32dyyYNtfHjNwrXXYFZd1G9JXF1JFB0LQmBeY5RdR0xM014kfux/w6KgxWBBk8GidoNFbQYLmw3mNRjs/Y2V6I4ctGgfNJhZY1DYGo2J1ZVua9UZK9k1Ol/fEebkueQi8ePYGYu7N4nV1ilui8YWNOuRz737DbxBu/8VH1TuMchy6xS22GtKRa06YyGvQSe3XmfnYRMtPLrA81ehYneYmW6dohadwrgcy3t1dv/SjDR59pLFfz62eOXPFiu2GOTUDvvGkApbND6NghaNmW6Ne7bpHD87ujgxFA22/dxglltnQaNGUSxXq8aceo259Rp3PqjztT6db/xQ556+qJj8pmit+NrSwuYQn0buxhCzakP0HTLQDbsY8YD/+5KFHh6eEy0ceNMgv1Fjdm2IopbhXHPrNHJqQ5H5bHeIdFeIqes18puFoOTa0oLGEKOR3xQia0OIux7SOHbavnpB1eLhF8JsOqhzzW+3/fG0yZcf0phWFaKgKZpHCFu5TWPfawav/cXkyHGT7//C4AvdekSw8MlPqC/Nb1AZjdw6lZnVKt87EEbVbRr42/sGJZ0hVmzROPuxXeCH18DRr5PhGs6T7VZ55EV7nssybPyJztRKlXl1Kgsa7fWlvI0qozFtvcod3SHe/If9vSJesrteMZhUplLUGuJogl3819n6fJjp61Xm1KpkV6vM26hy8Kj9GQmo0DGgM8UV9ROi4utLIuhGzK5VmVKp0Dmo4VdteTl13uLePo1b1irk1Cg8/bqBmXB+Dh4NR4rM2CAaVShsVThy3C7wI4+Fa49GWkWQ3HqVvAa7BmluvUIiuXXR6xRnkMXtCq+fiDsBgGHCEy+HydqgMLVKYYorSMeAhk+xufH2GZMvPaiS7lRIdwZZ3qvy1j/tAt+7ZPHNnSHSHEFya5O1SHNqg9ioiV6zq4OklgdoeiqEJ2hfmpPnTL6yRWVSWdR3siPAfdsVzly0b/OF6xaOfo2U8iApZQHu61M5dd7u89f3TVZsViMCk7TUBpFyaoLYcItOAqQ5/CxsCvLrd+0dBzWLzc+FmPDtABO+5SfTGWCyw09Rc5BX37GvdEiHHYd0JlcEmPCAzJpHVT64Ym/2jb+blHQopJUHIouTqEea5fYTz+waP1kb/Exc58f9Y5Wrsi0fFz0mbc+ofLE7yL1bFZa0BchwRoU+/rIW2f74cegtnZwaP9Iqmeq9Kpe9doEvvR0mrz5AWrkcqZ2oR8qu9hNPjttPSqnMvLoAh/+U8F6JfEtY/OuCyYkPTM5cNDj0hzB3fTfI51fLuHarXPPb/d89a3BHVwBplY/OwRBy3HMqpP709xozN8ikV8jMdtu1CCRhjJFdLTOtUiZlnY/qvQqXfaP8ZBkanoCFs19But/L8u4AJ87ZY8QOlD6mMOEBL48c1mzfRGK19xzRyHT5yHD6mFU9rCWGNKNKJoaYuLXUx/RKmcHfJq/eSOPYaSMi7HOrveS4ZV44lhBnwaYD4pTKPPmqZjOJd+m250OklslkOmWy1g9riSFNrxSCosyo8pFa5iXD4WXrcyrX/VakSy0Mmm5HzF/2WXQMqKSUeUkp9TK53EfzPoXLXjNiF1z1WTQ+qXDLd7y0Pa1wRY7mFJw6b7DqBwEmrvV+oiERm0DBtEofkx0+8htknP1BOgeUSOLWOMRnMe/oFydeJrXUxzSxTRU+8up9OPoDEbvAuSvAwgYfk9b6mF8n43giQOegQtszCvfvCJBVFY1L1PGJQCEoCZeP1HIvE9d5SRliUhyxOdG5WDV7c/Y4cS98IjaRc+1wPnGf7vAm149DmuryMhKZruhWp5ffGGFPjBPEx4n7TOeQzeklYwzx8UiZTg8jMXWMjCVuNNtIOeK5ocDxgjSlwsN4ZnwLdHiQJq65TkaiYZyQWupBKmgUR/06GeXJDjeTtPLrzKjyIolfE3f2+rh1nYd0R7Lj/x2Hh9QyDzPWe+kYCPJfL2NrzdIWpokAAAAASUVORK5CYII=',
    imageDataBottom: 'data:image/png;base64,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'
  };

  // 统一聊天组件类
  class AIBotChat {
    constructor(initData) {
      this.statue = 'close';
      this.visible = false;
      this.iframe = null;
      this.container = null;
      this.cb = {};
      this.position = position;
      this.wrapperDiv = null;
      this.containerDiv = null;
      this.resizePanel = null;
      this.overlayDiv = null;
      this.calculateMaxWidth = null;
      this.PANEL_WIDTH_KEY = 'aibot-sailvan-chat-panel-width-v1';
      this.windowResizeHandler = null;
      this.lastWidth = null;
      this.lastHeight = null;
      this.initData = initData;
      this.refreshToken = null;

      // 判断模式
      this.isGuestMode = !!initData.appkey;
      this.isAPIMode = !!(initData.chatInitPath && initData.renewTokenPath);

      if (!this.isGuestMode && !this.isAPIMode) {
        console.error('无法确定模式: 需要提供Guest模式参数(appkey)或API模式参数(chat-init-path和renew-token-path)');
        return;
      }

      // 通用配置
      this.setting = {
        app_name: '',
        app_instance: this.isAPIMode ? (initData.appInstance || 'eip_ai') : ('app' + initData.appid),
        unique_id: '',
        aiagent_baseuri: aiagentBaseurl,
      };

      // 根据模式设置特定配置
      if (this.isGuestMode) {
        this.guestInitParams = {
          app_id: initData.appid,
          access_token: initData.appkey,
          app_instance: 'app' + initData.appid,
          user: btoa(encodeURIComponent(JSON.stringify(initData.userOriginalObject))),
        };
      } else if (this.isAPIMode) {
        this.setting.chat_init_path = initData.chatInitPath;
        this.setting.renew_token_path = initData.renewTokenPath;
      }

      this.createChat();
    }

    createChat() {
      this.statue = 'onCreated';

      // 从localStorage获取之前保存的宽度，如果没有则使用默认值
      const defaultWidth = localStorage.getItem(this.PANEL_WIDTH_KEY) 
        ? Number.parseFloat(localStorage.getItem(this.PANEL_WIDTH_KEY)) 
        : 600;

      // 创建最外层容器
      const wrapperDiv = document.createElement('div');
      const wrapperStyles = {
        position: 'fixed',
        right: '8px',
        top: '0px',
        zIndex: '2000',
        height: '99vh',
        display: 'none',
      };
      Object.assign(wrapperDiv.style, wrapperStyles);

      // 计算最大宽度
      const calculateMaxWidth = () => {
        return window.innerWidth - 16;
      };

      // 确保初始宽度不超过最大限制
      const initialWidth = Math.min(defaultWidth, calculateMaxWidth() - 10);

      // 创建内部容器
      const containerDiv = document.createElement('div');
      const containerStyles = {
        height: '100%',
        width: `${initialWidth}px`,
        borderRadius: '10px',
        boxShadow: 'rgba(16, 24, 40, 0.08) 0px 12px 16px -4px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(16, 24, 40, 0.03) 0px 4px 6px -2px, rgba(16, 24, 40, 0.08) 0px 12px 16px -4px',
        overflow: 'hidden',
        backgroundColor: '#fff',
        position: 'relative',
      };
      Object.assign(containerDiv.style, containerStyles);

      // 创建iframe
      const iframe = document.createElement('iframe');
      iframe.src = this.setting.aiagent_baseuri;
      const iframeStyles = {
        height: '100%',
        width: '100%',
        border: 'none',
        scrolling: 'no',
      };
      Object.assign(iframe.style, iframeStyles);

      // 创建透明覆盖层
      const overlayDiv = document.createElement('div');
      const overlayStyles = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'transparent',
        zIndex: 20000,
        display: 'none',
      };
      Object.assign(overlayDiv.style, overlayStyles);

      // 创建拖拽调整大小的触发器
      const resizeTrigger = document.createElement('div');
      const triggerStyles = {
        position: 'absolute',
        left: '-8px',
        top: '50%',
        height: '60px',
        width: '16px',
        transform: 'translateY(-50%)',
        cursor: 'col-resize',
        backgroundColor: 'rgba(235, 238, 245, 0.7)',
        borderRadius: '4px 0 0 4px',
        zIndex: '20010',
        transition: 'background-color 0.2s, width 0.2s',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      };
      Object.assign(resizeTrigger.style, triggerStyles);

      // 创建拖拽把手内部的视觉标记
      const resizeHandle = document.createElement('div');
      const handleStyles = {
        height: '30px',
        width: '4px',
        borderRadius: '2px',
        backgroundColor: '#C0C6D4',
        pointerEvents: 'none',
      };
      Object.assign(resizeHandle.style, handleStyles);

      // 添加悬停效果
      resizeTrigger.addEventListener('mouseenter', () => {
        resizeHandle.style.backgroundColor = '#8590A6';
      });

      resizeTrigger.addEventListener('mouseleave', () => {
        resizeHandle.style.backgroundColor = '#C0C6D4';
      });

      // 组装DOM结构
      resizeTrigger.appendChild(resizeHandle);
      containerDiv.appendChild(iframe);
      containerDiv.appendChild(overlayDiv);
      wrapperDiv.appendChild(containerDiv);
      wrapperDiv.appendChild(resizeTrigger);
      document.body.appendChild(wrapperDiv);

      // 设置ResizePanel
      const resizePanel = this.createResizePanel({
        direction: 'horizontal',
        triggerDirection: 'left',
        minWidth: 420,
        maxWidth: () => Math.min(900, calculateMaxWidth()),
        minHeight: 300,
        maxHeight: window.innerHeight,
        onResizeStart: () => {
          overlayDiv.style.display = 'block';
        },
        onResize: (width, height) => {
          const maxPossibleWidth = Math.min(900, calculateMaxWidth());
          const safeWidth = Math.min(width, maxPossibleWidth);
          containerDiv.style.width = `${safeWidth}px`;
        },
        onResized: (width, height) => {
          overlayDiv.style.display = 'none';
          const maxPossibleWidth = Math.min(900, calculateMaxWidth());
          const safeWidth = Math.min(width, maxPossibleWidth);
          this.lastWidth = safeWidth > 0 ? safeWidth : containerDiv.offsetWidth;
          if (this.lastWidth) {
            localStorage.setItem(this.PANEL_WIDTH_KEY, this.lastWidth.toString());
          }
        },
      });

      resizePanel.setTriggerElement(resizeTrigger);
      resizePanel.setContainerElement(containerDiv);

      this.iframe = iframe;
      this.containerDiv = containerDiv;
      this.wrapperDiv = wrapperDiv;
      this.resizePanel = resizePanel;
      this.overlayDiv = overlayDiv;
      this.calculateMaxWidth = calculateMaxWidth;
      this.receiveMessage(iframe);

      // 窗口大小变化监听
      const handleWindowResize = () => {
        const maxHeight = window.innerHeight;
        const maxWidth = calculateMaxWidth();

        if (this.lastHeight && this.lastHeight > maxHeight) {
          containerDiv.style.height = `${maxHeight}px`;
          this.lastHeight = maxHeight;
        }

        if (this.lastWidth && this.lastWidth > maxWidth) {
          containerDiv.style.width = `${maxWidth}px`;
          this.lastWidth = maxWidth;
        }
      };

      window.addEventListener('resize', handleWindowResize);
      this.windowResizeHandler = handleWindowResize;
    }

    sendMessage(type = 'sendMessage', data = {}) {
      if (this.statue === 'ready') {
        this.iframe.contentWindow?.postMessage({ type, data }, '*');
      }
    }

    receiveMessage(iframe) {
      window.addEventListener('message', (event) => {
        if (event.source === iframe.contentWindow && ['', this.setting.app_instance].includes(event.data.appInstance)) {
          this.parse(event.data);
        }
      });
    }

    async parse(msg) {
      const { data, type } = msg;
      if (this.cb[type]) this.cb[type](msg, this);
      if (type === 'chatInit') this.chatInit();
      if (type === 'onclose') this.onClickEnter(false);
      if (type === 'chatopen') this.onClickEnter(true);
      if (type === 'apiError') {
        const obj = JSON.parse(data);
        if (obj.status === 401) this.reloadToken();
        if (obj.status === 403) this.reloadToken();
      }
      if (type === 'copyTextToClipboard') this.copyTextToClipboard(msg);
    }

    chatInit() {
      if (this.isGuestMode) {
        this.appendEnter(this.initData.container);
        this.statue = 'ready';
        this.sendMessage('guestInit', this.guestInitParams);
        return;
      }
      
      // API模式初始化
      this.apiCall(
        this.setting.chat_init_path, 
        { app_instance: this.setting.app_instance },
        (data) => {
          const { refresh_token, app_id, access_token, expired_in, unique_id, user, user_name } = data;
          this.refreshToken = refresh_token;
          this.setting.unique_id = unique_id;
          this.appendEnter(this.initData.container);
          this.statue = 'ready';
          this.sendMessage('chatInit', {
            access_token, unique_id, user, app_id, name: user_name,
            oauth_token_time_out: expired_in, conversation_name: this.setting.app_name,
            app_instance: this.setting.app_instance,
          });
        }
      );
    }

    createEnter() {
      const img = document.createElement('img');
      img.src = CONSTANTS.imageDataBottom;
      Object.assign(img.style, {
        'object-fit': 'cover',
        cursor: 'pointer',
        borderRadius: '8px',
        ...(this.position === 'left' ? { height: '24px' } : { margin: '6px 0' })
      });
      return img;
    }

    onClickEnter(visible) {
      this.visible = visible;
      this.wrapperDiv.style.display = this.visible ? 'block' : 'none';

      if (this.visible && this.iframe.src === 'about:blank') {
        this.iframe.src = this.setting.aiagent_baseuri;
      }

      this.sendMessage(this.visible ? 'chatopen' : 'chatclose', { app_instance: this.setting.app_instance });
    }

    appendEnter(container) {
      const img = this.createEnter();
      img.onclick = () => this.onClickEnter(!this.visible);
      img.className = 'chat-enter';

      if (!container) {
        const containerBox = document.createElement('div');
        const styles = {
          position: 'fixed',
          zIndex: '1900',
          bottom: '20px',
          right: '18px',
          overflow: 'hidden',
          width: '4rem',
          height: '4rem',
          flexDirection: 'column',
          gridGap: '.16667rem',
          gap: '.16667rem',
          borderRadius: '2.6667rem',
          display: 'inline-flex',
          justifyContent: 'center',
          alignItems: 'center',
          border: '1px solid #eaedf1',
          backgroundColor: '#538aff',
          boxShadow: '0 15px 35px -2px rgba(0, 0, 0, .05), 0 5px 15px 0 rgba(0, 0, 0, .05)',
        };
        Object.assign(containerBox.style, styles);
        containerBox.title = 'AI助手';
        img.src = CONSTANTS.aiImage;
        document.body.appendChild(containerBox);
        this.container = containerBox;
      } else if (typeof container === 'string') {
        this.container = document.querySelector(container);
      } else {
        this.container = container;
      }

      if (this.container && this.container.appendChild) {
        this.container.appendChild(img);
      } else {
        console.error('Invalid container provided.');
      }
    }

    reloadToken() {
      if (this.isGuestMode) {
        this.statue = 'ready';
        this.sendMessage('guestIReloadToken', this.guestInitParams);
        return;
      }
      
      // API模式重新加载token
      this.apiCall(
        this.setting.renew_token_path,
        { app_instance: this.setting.app_instance, refresh_token: this.refreshToken },
        (data) => {
          const { access_token, refresh_token } = data;
          this.statue = 'ready';
          this.refreshToken = refresh_token;
          this.sendMessage('reloadToken', { access_token });
        },
        () => this.sendMessage('message', { content: '用户信息获取失败,请刷新重试', type: 'warning' })
      );
    }

    // 统一的API调用方法
    apiCall(url, data, onSuccess, onError = () => {}) {
      $.post(url, data, ({ data: responseData, code }) => {
        if (code !== 'SUCCESS') {
          onError();
          return;
        }
        onSuccess(responseData);
      }, 'json').fail(() => onError());
    }

    copyTextToClipboard(msg) {
      if (!navigator.clipboard) {
        this.sendMessage('message', { content: '复制失败', type: 'warning' });
        return;
      }
      try {
        navigator.clipboard.writeText(JSON.parse(msg.data));
      } catch (error) {
        navigator.clipboard.writeText(msg.data);
      }
      this.sendMessage('message', { content: '复制成功', type: 'success' });
    }

    destroy() {
      if (this.windowResizeHandler) {
        window.removeEventListener('resize', this.windowResizeHandler);
        this.windowResizeHandler = null;
      }

      if (this.resizePanel) {
        this.resizePanel.destroy();
        this.resizePanel = null;
      }

      if (this.wrapperDiv && this.wrapperDiv.parentNode) {
        this.wrapperDiv.parentNode.removeChild(this.wrapperDiv);
        this.wrapperDiv = null;
      }

      this.iframe = null;
      this.overlayDiv = null;
      this.visible = false;
      this.statue = 'close';
      this.lastWidth = null;
      this.lastHeight = null;
    }

    createResizePanel(params = {}) {
      const {
        direction = 'both',
        triggerDirection = 'bottom-right',
        minWidth = -Infinity,
        maxWidth = Infinity,
        minHeight = -Infinity,
        maxHeight = Infinity,
        onResizeStart,
        onResized,
        onResize,
      } = params;

      const refs = {
        triggerElement: null,
        containerElement: null,
        initX: 0,
        initY: 0,
        initContainerWidth: 0,
        initContainerHeight: 0,
        isResizing: false,
        prevUserSelectStyle: '',
      };

      function handleStartResize(e) {
        if (!refs.containerElement) return;

        e.preventDefault();
        e.stopPropagation();

        refs.initX = e.clientX;
        refs.initY = e.clientY;
        refs.initContainerWidth = refs.containerElement.offsetWidth || minWidth;
        refs.initContainerHeight = refs.containerElement.offsetHeight || minHeight;

        refs.isResizing = true;
        refs.prevUserSelectStyle = getComputedStyle(document.body).userSelect;
        document.body.style.userSelect = 'none';

        if (onResizeStart) {
          onResizeStart();
        }

        document.addEventListener('mousemove', handleResize, true);
        document.addEventListener('mouseup', handleStopResize, true);
      }

      function handleResize(e) {
        if (!refs.isResizing || !refs.containerElement) return;

        e.preventDefault();
        e.stopPropagation();

        if (direction === 'horizontal' || direction === 'both') {
          const offsetX = e.clientX - refs.initX;
          let width = 0;

          if (['left', 'top-left', 'bottom-left'].includes(triggerDirection)) {
            width = refs.initContainerWidth - offsetX;
          } else if (['right', 'top-right', 'bottom-right'].includes(triggerDirection)) {
            width = refs.initContainerWidth + offsetX;
          }

          if (width < minWidth) width = minWidth;

          const currentMaxWidth = typeof maxWidth === 'function' ? maxWidth() : maxWidth;
          if (width > currentMaxWidth) width = currentMaxWidth;

          if (onResize) onResize(width, 0);
        }

        if (direction === 'vertical' || direction === 'both') {
          const offsetY = e.clientY - refs.initY;
          let height = 0;

          if (['top', 'top-left', 'top-right'].includes(triggerDirection)) {
            height = refs.initContainerHeight - offsetY;
          } else if (['bottom', 'bottom-left', 'bottom-right'].includes(triggerDirection)) {
            height = refs.initContainerHeight + offsetY;
          }

          if (height < minHeight) height = minHeight;

          const currentMaxHeight = typeof maxHeight === 'function' ? maxHeight() : maxHeight;
          if (height > currentMaxHeight) height = currentMaxHeight;

          if (onResize) onResize(0, height);
        }
      }

      function handleStopResize(e) {
        e.preventDefault();
        e.stopPropagation();

        document.removeEventListener('mousemove', handleResize, true);
        document.removeEventListener('mouseup', handleStopResize, true);

        refs.isResizing = false;
        document.body.style.userSelect = refs.prevUserSelectStyle;

        if (onResized && refs.containerElement) {
          onResized(refs.containerElement.offsetWidth, refs.containerElement.offsetHeight);
        }
      }

      function initialize() {
        if (refs.triggerElement) {
          refs.triggerElement.addEventListener('mousedown', handleStartResize);
        }
      }

      function cleanup() {
        if (refs.triggerElement) {
          refs.triggerElement.removeEventListener('mousedown', handleStartResize);
        }
        document.removeEventListener('mousemove', handleResize, true);
        document.removeEventListener('mouseup', handleStopResize, true);
      }

      return {
        setTriggerElement(element) {
          cleanup();
          refs.triggerElement = element;
          initialize();
          return this;
        },

        setContainerElement(element) {
          refs.containerElement = element;
          return this;
        },

        destroy() {
          cleanup();
        },
      };
    }
  }

  
    // 检查必要参数
    if (!aiagentBaseurl) {
      console.error('缺少必要参数: aiagent_baseuri');
      return;
    }

    // 判断使用哪种模式
    // 支持通过 mode 参数显式指定模式，或通过参数自动判断
    const explicitMode = scriptElement.getAttribute('mode');
    let isGuestMode = false;
    let isAPIMode = false;

    if (explicitMode === 'guest') {
      isGuestMode = true;
    } else if (explicitMode === 'api') {
      isAPIMode = true;
    } else {
      // 自动判断模式
      isGuestMode = !!appkey;
      isAPIMode = !!(chatInitPath && renewTokenPath);
    }

    if (!isGuestMode && !isAPIMode) {
      console.error('参数错误: 需要提供Guest模式参数(appkey + 用户信息)或API模式参数(chat-init-path + renew-token-path)，或通过mode属性指定模式');
      return;
    }

    // 验证模式对应的必要参数
    if (isGuestMode) {
      if (!appkey || !appid) {
        console.error('Guest模式缺少必要参数: 需要提供 appkey 和 appid');
        return;
      }
    }

    if (isAPIMode) {
      if (!chatInitPath || !renewTokenPath) {
        console.error('API模式缺少必要参数: 需要提供 chat_init_path 和 renew_token_path');
        return;
      }
    }

    // 构建初始化数据
    const initData = {
      container: containerSelector,
      ...(isGuestMode && {
        appid,
        appkey,
        userOriginalObject: {
          workcode: userWorkcode || '',
          username: userName || '',
          company: userCompany || '',
          email: userEmail || '',
        },
      }),
      ...(isAPIMode && {
        chatInitPath,
        renewTokenPath,
        appInstance,
      }),
    };

    // 创建全局实例
    window.AIBotChatInstance = new AIBotChat(initData);
  } // end of initializeAIBot function

  // 确保DOM加载完成后初始化
  function startInitialization() {
    ensureJQuery(initializeAIBot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startInitialization);
  } else {
    startInitialization();
  }

})();