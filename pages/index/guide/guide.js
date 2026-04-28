const { GuideMachine, GuideStates } = require('../guide-machine.js');

Component({
  properties: {
    enabled: {
      type: Boolean,
      value: false
    }
  },

  data: {
    visible: false,
    currentStep: null,
    highlightStyle: null,
    displayedText: '',
    isTyping: false
  },

  lifetimes: {
    attached() {
      this.guideMachine = new GuideMachine({
        page: this,
        onStateChange: this.handleStateChange.bind(this),
        onComplete: this.handleComplete.bind(this)
      });
    },

    ready() {
      if (this.data.enabled) {
        this.initGuide();
      }
    }
  },

  observers: {
    'enabled': function(enabled) {
      if (enabled) {
        this.initGuide();
      } else {
        this.hideGuide();
      }
    }
  },

  methods: {
    initGuide() {
      this.guideMachine.init(this);
      this.setData({ visible: true });
      
      const step = this.guideMachine.getCurrentStep();
      this.updateStepData(step);
    },

    hideGuide() {
      this.setData({ visible: false });
    },

    handleStateChange(state, step) {
      console.log('[Guide Component] State changed:', state);
      
      this.updateStepData(step);
      
      if (step.highlightTarget) {
        this.refreshHighlight();
      }
    },

    updateStepData(step) {
      if (!step) return;

      if (this.typingTimer) {
        clearInterval(this.typingTimer);
      }

      const stepData = {
        state: step.state,
        title: step.title,
        dialog: step.dialog,
        narrative: step.narrative,
        subtitle: step.subtitle,
        maskOpacity: step.maskOpacity,
        showNPC: step.showNPC,
        highlightTarget: step.highlightTarget,
        npcAnimation: step.npcAnimation,
        autoAdvance: step.autoAdvance,
        arrowPointer: step.arrowPointer || false,
        specialEffect: step.specialEffect || null,
        displayedText: '',
        isTyping: false
      };

      this.setData({ currentStep: stepData });

      if (step.dialog) {
        this.startTypingEffect(step.dialog);
      }
    },

    startTypingEffect(text) {
      let index = 0;
      this.setData({ isTyping: true, displayedText: '' });
      
      this.typingTimer = setInterval(() => {
        if (index >= text.length) {
          clearInterval(this.typingTimer);
          this.setData({ 
            isTyping: false,
            displayedText: text
          });
          return;
        }
        this.setData({ 
          displayedText: text.substring(0, index + 1)
        });
        index++;
      }, 100);
    },

    async refreshHighlight() {
      await this.guideMachine.refreshHighlightPosition();
      const style = this.guideMachine.getHighlightStyle(25);
      
      if (style) {
        this.setData({
          'currentStep.highlightStyle': style
        });
      }

      return style;
    },

    handleContinue() {
      console.log('[Guide] Continue clicked');
      this.guideMachine.next();
    },

    handleDialogTap() {
      if (this.data.isTyping && this.data.currentStep) {
        clearInterval(this.typingTimer);
        this.setData({
          isTyping: false,
          displayedText: this.data.currentStep.dialog
        });
      }
    },

    handleMaskTap() {
      const step = this.guideMachine.getCurrentStep();
      if (step && step.state === GuideStates.INIT) {
        this.guideMachine.next();
      }
    },

    handleCanvasStroke() {
      this.guideMachine.handleCanvasStroke();
    },

    handleComplete() {
      console.log('[Guide] Guide completed');
      this.triggerEvent('complete');
      
      setTimeout(() => {
        this.setData({ visible: false });
      }, 1500);
    },

    reset() {
      this.guideMachine.reset();
      this.initGuide();
    }
  }
});
