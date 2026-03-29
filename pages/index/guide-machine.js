const GuideStates = {
  INIT: 'INIT',
  GREETING: 'GREETING',
  FOCUS_TOOL: 'FOCUS_TOOL',
  WAIT_FOR_STROKE: 'WAIT_FOR_STROKE',
  AWAKENING: 'AWAKENING',
  COMPLETED: 'COMPLETED'
};

const GuideSteps = [
  {
    state: GuideStates.INIT,
    title: '序章',
    dialog: '',
    narrative: '每一个字，都有骨相...',
    subtitle: '欢迎来到智墨穿梭',
    duration: 3000,
    autoAdvance: true,
    maskOpacity: 1,
    showNPC: false,
    highlightTarget: null
  },
  {
    state: GuideStates.GREETING,
    title: '初见',
    dialog: '赛奴！我是蒙宝。在“字帖”中我可以对你的书写进行AI打分哦~',
    narrative: '',
    subtitle: '',
    duration: 0,
    autoAdvance: false,
    maskOpacity: 0.6,
    showNPC: true,
    highlightTarget: null,
    audioEffect: 'npc_greeting',
    npcAnimation: 'slideInRight'
  },
  {
    state: GuideStates.FOCUS_TOOL,
    title: '寻笔',
    dialog: '工欲善其事，必先利其器。长按音乐键可以切换背景音乐风格。',
    narrative: '',
    subtitle: '',
    duration: 0,
    autoAdvance: false,
    maskOpacity: 0.85,
    showNPC: true,
    highlightTarget: '#practice-btn',
    audioEffect: 'find_brush'
  },
  {
    state: GuideStates.WAIT_FOR_STROKE,
    title: '落笔',
    dialog: '请点击左上角打开侧边栏，打开字帖，开启你的书法之旅。',
    narrative: '',
    subtitle: '',
    duration: 0,
    autoAdvance: false,
    maskOpacity: 0.7,
    showNPC: true,
    highlightTarget: '#canvas-area',
    audioEffect: 'write_stroke',
    arrowPointer: true
  },
];

class HighlightCalculator {
  constructor(pageContext) {
    this.page = pageContext;
  }

  async getNodePosition(selector) {
    if (!selector) return null;

    return new Promise((resolve) => {
      try {
        const query = this.page.createSelectorQuery();
        query.select(selector).boundingClientRect((rect) => {
          if (rect) {
            resolve({
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              right: rect.right,
              bottom: rect.bottom
            });
          } else {
            resolve(null);
          }
        }).exec();
      } catch (e) {
        console.warn('[Guide] Node position error:', e);
        resolve(null);
      }
    });
  }

  calculateHighlightStyle(targetRect, padding = 20) {
    if (!targetRect) return null;

    return {
      top: `${targetRect.top - padding}px`,
      left: `${targetRect.left - padding}px`,
      width: `${targetRect.width + padding * 2}px`,
      height: `${targetRect.height + padding * 2}px`
    };
  }
}

class GuideMachine {
  constructor(options = {}) {
    this.currentState = GuideStates.INIT;
    this.steps = GuideSteps;
    this.page = options.page || null;
    this.onStateChange = options.onStateChange || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.highlightCalculator = null;
    this.currentHighlightRect = null;
    this.canvasCallback = options.canvasCallback || null;
    this._strokeDetected = false;
  }

  init(pageContext) {
    this.page = pageContext;
    this.highlightCalculator = new HighlightCalculator(pageContext);
    console.log('[GuideMachine] Initialized');
  }

  getCurrentStep() {
    return this.steps.find(step => step.state === this.currentState);
  }

  async next() {
    const currentIndex = this.steps.findIndex(step => step.state === this.currentState);

    if (currentIndex === -1 || currentIndex >= this.steps.length - 1) {
      return this.complete();
    }

    const nextStep = this.steps[currentIndex + 1];
    await this.transitionTo(nextStep.state);

    return this.currentState;
  }

  async transitionTo(targetState) {
    console.log(`[GuideMachine] Transition: ${this.currentState} -> ${targetState}`);

    const step = this.steps.find(s => s.state === targetState);
    if (!step) {
      console.error('[GuideMachine] Invalid state:', targetState);
      return;
    }

    if (step.highlightTarget) {
      await this.updateHighlightPosition(step.highlightTarget);
    } else {
      this.currentHighlightRect = null;
    }

    this.currentState = targetState;
    this.onStateChange(this.currentState, step);

    if (step.autoAdvance && step.duration > 0) {
      setTimeout(() => {
        this.next();
      }, step.duration);
    }
  }

  async updateHighlightPosition(selector) {
    if (!this.highlightCalculator) return;

    const rect = await this.highlightCalculator.getNodePosition(selector);
    this.currentHighlightRect = rect;
  }

  async refreshHighlightPosition() {
    const step = this.getCurrentStep();
    if (step && step.highlightTarget) {
      await this.updateHighlightPosition(step.highlightTarget);
      return this.currentHighlightRect;
    }
    return null;
  }

  handleCanvasStroke() {
    if (this.currentState === GuideStates.WAIT_FOR_STROKE && !this._strokeDetected) {
      this._strokeDetected = true;
      console.log('[GuideMachine] Stroke detected, triggering awakening');
      this.next();
    }
  }

  complete() {
    this.currentState = GuideStates.COMPLETED;
    this.onComplete();
    console.log('[GuideMachine] Guide completed');
    return this.currentState;
  }

  reset() {
    this.currentState = GuideStates.INIT;
    this._strokeDetected = false;
    this.currentHighlightRect = null;
    console.log('[GuideMachine] Reset to initial state');
  }

  getHighlightStyle(padding = 25) {
    if (!this.currentHighlightRect) return null;
    return this.highlightCalculator.calculateHighlightStyle(
      this.currentHighlightRect,
      padding
    );
  }
}

module.exports = {
  GuideStates,
  GuideSteps,
  GuideMachine,
  HighlightCalculator
};
