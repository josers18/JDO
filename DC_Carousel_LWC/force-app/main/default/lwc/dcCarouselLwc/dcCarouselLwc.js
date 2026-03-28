import { LightningElement, api, track } from 'lwc';

/**
 * Horizontal carousel aligned with SLDS carousel guidance (structure, controls, a11y).
 * @see https://www.lightningdesignsystem.com/2e1ef8501/p/99642e-carousel
 *
 * Composition: default slot — each assigned root element becomes one slide.
 * Fallback: slidesJson when the slot has no assigned elements.
 *
 * @slot Default slot for nested Lightning components (one slide per assigned root).
 */
export default class DcCarouselLwc extends LightningElement {
    @api cardTitle = 'Carousel';
    /** Defaults to true via App Builder metadata when unset. */
    @api showTitle;
    @api showArrows;
    @api showDots;
    @api autoplay = false;
    @api autoplayIntervalSeconds = 6;
    /** Rich-text fallback when the slot has no assigned elements. */
    @api slidesJson = '';

    @api recordId;

    @track _compositionSlideCount = 0;
    @track _configuredSlides = [];
    @track activeIndex = 0;

    _autoplayTimer;
    _pausedByUser;

    connectedCallback() {
        this.template.addEventListener('keydown', this._onKeydownBound);
        Promise.resolve().then(() => this.refreshSlideSources());
    }

    disconnectedCallback() {
        this.template.removeEventListener('keydown', this._onKeydownBound);
        this._clearAutoplay();
    }

    _onKeydownBound = (e) => {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.goPrev();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            this.goNext();
        }
    };

    renderedCallback() {
        this._applySlideBasisCssVar();
        this._syncAutoplay();
    }

    get resolvedTitle() {
        return (this.cardTitle || '').trim() || 'Carousel';
    }

    get titleVisible() {
        return this.showTitle !== false;
    }

    get arrowsVisible() {
        return this.showArrows !== false;
    }

    get dotsVisible() {
        return this.showDots !== false;
    }

    get isCompositionMode() {
        return this._compositionSlideCount > 0;
    }

    /** Rich-text slides shown only when nothing is nested in the slot. */
    get showRichLayer() {
        return !this.isCompositionMode && this._configuredSlides.length > 0;
    }

    get slideCount() {
        if (this.isCompositionMode) {
            return this._compositionSlideCount;
        }
        return this._configuredSlides.length;
    }

    get hasSlides() {
        return this.slideCount > 0;
    }

    get showChrome() {
        return this.slideCount > 1;
    }

    get compositionTrackClass() {
        const base = 'dc-carousel__track';
        return this.showRichLayer ? `${base} slds-hide` : base;
    }

    /**
     * Track is (n × 100)% of the viewport width; translateX moves by whole slides.
     */
    get trackStyle() {
        const n = this.slideCount;
        if (n < 1) {
            return '';
        }
        const shift = -(this.activeIndex * (100 / n));
        return `transform: translateX(${shift}%); width: ${n * 100}%;`;
    }

    get richPanelStyle() {
        const n = Math.max(this.slideCount, 1);
        const w = 100 / n;
        return `flex: 0 0 ${w}%; min-width: ${w}%; max-width: ${w}%; box-sizing: border-box;`;
    }

    get ariaLive() {
        return this.autoplay && this.isCompositionMode ? 'off' : 'polite';
    }

    get dotButtons() {
        const n = this.slideCount;
        const out = [];
        for (let i = 0; i < n; i++) {
            const active = i === this.activeIndex;
            out.push({
                key: `dot-${i}`,
                index: i,
                label: `Go to slide ${i + 1} of ${n}`,
                ariaSelected: active,
                className: active
                    ? 'dc-carousel__indicator dc-carousel__indicator_active'
                    : 'dc-carousel__indicator'
            });
        }
        return out;
    }

    _applySlideBasisCssVar() {
        const n = this.slideCount;
        if (n < 1) {
            return;
        }
        const pct = `${100 / n}%`;
        this.style.setProperty('--dc-carousel-slide-basis', pct);
    }

    handleSlotChange() {
        this.refreshSlideSources();
    }

    refreshSlideSources() {
        const slot = this.template.querySelector('slot');
        if (!slot) {
            this._compositionSlideCount = 0;
            this._parseSlidesJson();
            this._clampActive();
            return;
        }
        const assigned = slot.assignedElements({ flatten: true });
        this._compositionSlideCount = assigned.length;
        if (this._compositionSlideCount > 0) {
            this._configuredSlides = [];
        } else {
            this._parseSlidesJson();
        }
        this._clampActive();
        this._clearAutoplay();
        this._syncAutoplay();
    }

    _parseSlidesJson() {
        const raw = (this.slidesJson || '').trim();
        if (!raw) {
            this._configuredSlides = [];
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                this._configuredSlides = [];
                return;
            }
            this._configuredSlides = parsed
                .map((s, i) => ({
                    key: `cfg-${i}`,
                    title: (s && s.title) || `Slide ${i + 1}`,
                    content: (s && s.content) || ''
                }))
                .filter((s) => s.content);
        } catch {
            this._configuredSlides = [];
        }
    }

    _clampActive() {
        const n = this.slideCount;
        if (n < 1) {
            this.activeIndex = 0;
            return;
        }
        this.activeIndex = Math.min(Math.max(this.activeIndex, 0), n - 1);
    }

    goPrev() {
        const n = this.slideCount;
        if (n < 2) {
            return;
        }
        this.activeIndex = (this.activeIndex - 1 + n) % n;
        this._restartAutoplay();
    }

    goNext() {
        const n = this.slideCount;
        if (n < 2) {
            return;
        }
        this.activeIndex = (this.activeIndex + 1) % n;
        this._restartAutoplay();
    }

    handleDotClick(event) {
        const idx = Number(event.currentTarget.dataset.index);
        if (!Number.isFinite(idx)) {
            return;
        }
        this.activeIndex = idx;
        this._restartAutoplay();
    }

    handleMouseEnter() {
        this._pausedByUser = true;
        this._clearAutoplay();
    }

    handleMouseLeave() {
        this._pausedByUser = false;
        this._syncAutoplay();
    }

    handleFocusIn() {
        this._pausedByUser = true;
        this._clearAutoplay();
    }

    handleFocusOut() {
        this._pausedByUser = false;
        this._syncAutoplay();
    }

    _resolvedIntervalMs() {
        const s = Number(this.autoplayIntervalSeconds);
        const sec = Number.isFinite(s) && s >= 3 ? s : 6;
        return sec * 1000;
    }

    _clearAutoplay() {
        if (this._autoplayTimer) {
            window.clearInterval(this._autoplayTimer);
            this._autoplayTimer = undefined;
        }
    }

    _syncAutoplay() {
        this._clearAutoplay();
        if (
            !this.autoplay ||
            !this.isCompositionMode ||
            this.slideCount < 2 ||
            this._pausedByUser
        ) {
            return;
        }
        this._autoplayTimer = window.setInterval(() => {
            this.goNext();
        }, this._resolvedIntervalMs());
    }

    _restartAutoplay() {
        this._clearAutoplay();
        this._syncAutoplay();
    }
}
