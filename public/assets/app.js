(() => {
  const app = document.getElementById('blockerApp');
  if (!app || app.dataset.initialized === '1') return;
  app.dataset.initialized = '1';

  const csrf = app.dataset.csrf || '';
  const localNode = app.dataset.node || '';
  const $ = (id) => document.getElementById(id);

  const livePanel = $('livePanel');
  const blockedPanel = $('blockedPanel');
  const liveList = $('liveList');
  const blockedList = $('blockedList');
  const allCount = $('allCount');
  const keyedCount = $('keyedCount');
  const connectedCount = $('connectedCount');
  const blockedCount = $('blockedCount');
  const liveHeading = $('liveHeading');
  const lastUpdate = $('lastUpdate');
  const noticeArea = $('noticeArea');
  const allowlistWarning = $('allowlistWarning');
  const allowlistText = $('allowlistText');
  const statusWarning = $('statusWarning');
  const themeButton = $('themeButton');
  const dialog = $('confirmDialog');
  const confirmMessage = $('confirmMessage');
  const reasonWrap = $('reasonWrap');
  const confirmReason = $('confirmReason');
  const confirmCancel = $('confirmCancel');
  const confirmGo = $('confirmGo');
  const manualForm = $('manualBlockForm');
  const filterButtons = [...document.querySelectorAll('.filter-button')];

  let busy = false;
  let pending = null;
  let pollTimer = null;
  let currentFilter = 'all';
  let snapshot = { connections: [], keyed: [], blocked: [] };

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const formatSeconds = (value) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return 'Keyed now';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
      : `${m}:${String(r).padStart(2, '0')}`;
  };

  const modeShort = (link) => {
    const label = String(link?.mode_label || '').toLowerCase();
    const type = String(link?.connection_type || '').toLowerCase();
    if (type === 'echolink' || label.includes('echolink')) return 'EchoLink';
    if (label.includes('web transceiver') || type === 'client') return 'WT';
    return 'NODE';
  };

  const modeClass = (mode) => mode === 'WT'
    ? 'mode-wt'
    : mode === 'EchoLink'
      ? 'mode-echolink'
      : 'mode-node';

  const activityText = (link) => {
    if (link?.keyed) return `Keyed ${formatSeconds(link.keyed_seconds)}`;
    const elapsed = String(link?.elapsed || '').trim();
    return elapsed || 'Connected';
  };

  const blockerAppearanceNode =
    document.getElementById(
      'blockerAppearance'
    );

  const blockerAppearanceDefault = {
    version: 1,
    theme: 'dark',
    mode: 'default',
    custom: {
      dark: null,
      light: null
    }
  };

  let blockerAppearance =
    JSON.parse(
      JSON.stringify(
        blockerAppearanceDefault
      )
    );

  try {
    const parsed =
      JSON.parse(
        blockerAppearanceNode?.textContent ||
        '{}'
      );

    if (
      parsed &&
      typeof parsed === 'object'
    ) {
      blockerAppearance = {
        version: 1,

        theme:
          parsed.theme === 'light'
            ? 'light'
            : 'dark',

        mode:
          parsed.mode === 'custom'
            ? 'custom'
            : 'default',

        custom: {
          dark:
            parsed.custom?.dark &&
            typeof parsed.custom.dark === 'object'
              ? parsed.custom.dark
              : null,

          light:
            parsed.custom?.light &&
            typeof parsed.custom.light === 'object'
              ? parsed.custom.light
              : null
        }
      };
    }
  } catch (_) {}

  const blockerSaveAppearance =
    async () => {
      const appRoot =
        document.getElementById(
          'blockerApp'
        );

      const csrf =
        String(
          appRoot?.dataset.csrf || ''
        );

      if (!csrf) {
        throw new Error(
          'Missing security token.'
        );
      }

      const form =
        new FormData();

      form.set('csrf', csrf);
      form.set(
        'action',
        'appearance'
      );
      form.set(
        'appearance',
        JSON.stringify(
          blockerAppearance
        )
      );

      const response =
        await fetch(
          'action.php',
          {
            method: 'POST',
            body: form,
            credentials: 'same-origin',
            cache: 'no-store'
          }
        );

      let result = null;

      try {
        result = await response.json();
      } catch (_) {}

      if (
        !response.ok ||
        !result?.ok
      ) {
        throw new Error(
          result?.message ||
          'Appearance settings could not be saved.'
        );
      }

      return result;
    };

  const blockerSaveFailed =
    (error) => {
      console.error(
        'Appearance save failed:',
        error
      );

      showNotice(
        'error',
        'Appearance could not be saved to the node.'
      );
    };

  const applyTheme = (theme) => {
    const selected =
      theme === 'light'
        ? 'light'
        : 'dark';

    document.documentElement
      .dataset
      .theme =
        selected;

    blockerAppearance.theme =
      selected;

    if (themeButton) {
      themeButton.dataset.theme =
        selected;

      themeButton.title =
        `Theme: ${selected}`;
    }
  };

  applyTheme(
    blockerAppearance.theme
  );

  themeButton?.addEventListener(
    'click',
    () => {
      const current =
        document.documentElement
          .dataset
          .theme ||
        'dark';

      const next =
        current === 'dark'
          ? 'light'
          : 'dark';

      applyTheme(next);

      requestAnimationFrame(
        blockerApplyActiveTheme
      );

      void blockerSaveAppearance()
        .catch(blockerSaveFailed);
    }
  );


  // =========================================================
  // BLOCKER COLOR PICKER LOGIC
  // Separate custom colors for Light and Dark.
  // =========================================================

  const blockerColorMenu =
    document.getElementById('colorMenu');

  const blockerColorMainPanel =
    document.getElementById('colorMainPanel');

  const blockerColorPreset =
    document.getElementById('colorPreset');

  const blockerCustomFields =
    document.getElementById('customColorFields');

  const blockerColorMessage =
    document.getElementById('colorMessage');

  const blockerColorEditor =
    document.getElementById('colorEditor');

  const blockerColorEditorTitle =
    document.getElementById('colorEditorTitle');

  const blockerColorEditorPreview =
    document.getElementById('colorEditorPreview');

  const blockerQuickPalette =
    document.getElementById('quickColorPalette');

  const blockerHue =
    document.getElementById('colorHue');

  const blockerSaturation =
    document.getElementById('colorSaturation');

  const blockerBrightness =
    document.getElementById('colorBrightness');

  const blockerHex =
    document.getElementById('colorHex');

  const blockerUseColor =
    document.getElementById('useColor');

  const blockerCancelColor =
    document.getElementById('cancelColor');

  const blockerApplyColors =
    document.getElementById('applyColors');

  const blockerResetColors =
    document.getElementById('resetColors');

  const BLOCKER_MODE_KEY =
    'appearance-mode';

  const blockerCustomKey = (theme) =>
    `appearance-custom-${theme}`;

  const blockerCustomThemeFromKey =
    (key) => {
      if (
        key ===
        blockerCustomKey('dark')
      ) {
        return 'dark';
      }

      if (
        key ===
        blockerCustomKey('light')
      ) {
        return 'light';
      }

      return '';
    };

  const blockerStoreGet = (
    key,
    fallback = ''
  ) => {
    if (key === BLOCKER_MODE_KEY) {
      return blockerAppearance.mode ||
        fallback;
    }

    const theme =
      blockerCustomThemeFromKey(key);

    if (theme) {
      const value =
        blockerAppearance
          .custom
          [theme];

      return value
        ? JSON.stringify(value)
        : fallback;
    }

    return fallback;
  };

  const blockerStoreSet = (
    key,
    value
  ) => {
    if (key === BLOCKER_MODE_KEY) {
      blockerAppearance.mode =
        value === 'custom'
          ? 'custom'
          : 'default';

      return;
    }

    const theme =
      blockerCustomThemeFromKey(key);

    if (!theme) {
      return;
    }

    try {
      const parsed =
        typeof value === 'string'
          ? JSON.parse(value)
          : value;

      blockerAppearance
        .custom
        [theme] =
          parsed &&
          typeof parsed === 'object'
            ? parsed
            : null;
    } catch (_) {
      blockerAppearance
        .custom
        [theme] =
          null;
    }
  };

  const blockerStoreRemove = (key) => {
    if (key === BLOCKER_MODE_KEY) {
      blockerAppearance.mode =
        'default';

      return;
    }

    const theme =
      blockerCustomThemeFromKey(key);

    if (theme) {
      blockerAppearance
        .custom
        [theme] =
          null;
    }
  };

  const blockerEffectiveTheme = () =>
    document.documentElement
      .dataset
      .theme === 'light'
        ? 'light'
        : 'dark';

  const blockerRgb = (hex) => {
    const match =
      /^#([0-9a-f]{6})$/i.exec(String(hex));

    if (!match) return null;

    const value =
      Number.parseInt(match[1], 16);

    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255
    };
  };

  const blockerHexFromRgb = (
    r,
    g,
    b
  ) => {
    const byte = (value) =>
      Math.max(
        0,
        Math.min(255, Math.round(value))
      )
        .toString(16)
        .padStart(2, '0');

    return (
      '#' +
      byte(r) +
      byte(g) +
      byte(b)
    ).toUpperCase();
  };

  const blockerMix = (
    first,
    second,
    amount
  ) => {
    const a = blockerRgb(first);
    const b = blockerRgb(second);

    if (!a || !b) return first;

    return blockerHexFromRgb(
      a.r + ((b.r - a.r) * amount),
      a.g + ((b.g - a.g) * amount),
      a.b + ((b.b - a.b) * amount)
    );
  };

  const blockerHexToHsl = (hex) => {
    const rgb = blockerRgb(hex);

    if (!rgb) {
      return { h: 0, s: 0, l: 0 };
    }

    let r = rgb.r / 255;
    let g = rgb.g / 255;
    let b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    let h = 0;
    let s = 0;

    const l =
      (max + min) / 2;

    if (max !== min) {
      const d = max - min;

      s = l > 0.5
        ? d / (2 - max - min)
        : d / (max + min);

      if (max === r) {
        h =
          ((g - b) / d) +
          (g < b ? 6 : 0);
      } else if (max === g) {
        h =
          ((b - r) / d) + 2;
      } else {
        h =
          ((r - g) / d) + 4;
      }

      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  };

  const blockerHslToHex = (
    hue,
    saturation,
    lightness
  ) => {
    let h = Number(hue) / 360;
    let s = Number(saturation) / 100;
    let l = Number(lightness) / 100;

    let r;
    let g;
    let b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hueValue = (
        p,
        q,
        t
      ) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;

        if (t < (1 / 6)) {
          return (
            p +
            ((q - p) * 6 * t)
          );
        }

        if (t < (1 / 2)) {
          return q;
        }

        if (t < (2 / 3)) {
          return (
            p +
            ((q - p) *
              ((2 / 3) - t) *
              6)
          );
        }

        return p;
      };

      const q = l < 0.5
        ? l * (1 + s)
        : l + s - (l * s);

      const p =
        (2 * l) - q;

      r = hueValue(
        p,
        q,
        h + (1 / 3)
      );

      g = hueValue(
        p,
        q,
        h
      );

      b = hueValue(
        p,
        q,
        h - (1 / 3)
      );
    }

    return blockerHexFromRgb(
      r * 255,
      g * 255,
      b * 255
    );
  };

  const blockerCssHex = (
    name,
    fallback
  ) => {
    const value =
      getComputedStyle(
        document.documentElement
      )
        .getPropertyValue(name)
        .trim();

    return /^#[0-9a-f]{6}$/i.test(value)
      ? value.toUpperCase()
      : fallback;
  };

  const blockerClearVars = () => {
    [
      '--bg',
      '--card',
      '--card-2',
      '--text',
      '--page-text',
      '--muted',
      '--secondary-text',
      '--table-label',
      '--line',
      '--primary',
      '--focus'
    ].forEach((name) => {
      document.documentElement
        .style
        .removeProperty(name);
    });
  };

  const blockerDefaultColors = () => {
    blockerClearVars();

    const dark =
      blockerEffectiveTheme() === 'dark';

    return {
      background:
        blockerCssHex(
          '--bg',
          dark
            ? '#0B1220'
            : '#F5F7FB'
        ),

      foreground:
        blockerCssHex(
          '--card',
          dark
            ? '#000000'
            : '#FFFFFF'
        ),

      text:
        blockerCssHex(
          '--text',
          dark
            ? '#EDF3FF'
            : '#182235'
        ),

      secondary:
        blockerCssHex(
          '--secondary-text',
          dark
            ? '#D3DEED'
            : '#56677E'
        ),

      headings:
        blockerCssHex(
          '--table-label',
          dark
            ? '#B2D4EA'
            : '#49647E'
        ),

      accent:
        blockerCssHex(
          '--primary',
          '#739BFF'
        )
    };
  };

  const blockerBuildVars = (
    colors
  ) => {
    /*
     * Every color exposed in Advanced is authoritative.
     * If the user selects a valid #RRGGBB color, use that
     * exact color without automatic contrast substitution.
     *
     * Only internal colors with no direct Advanced control
     * are derived automatically.
     */
    return {
      '--bg':
        colors.background,

      '--card':
        colors.foreground,

      '--card-2':
        blockerMix(
          colors.foreground,
          colors.text,
          0.07
        ),

      '--text':
        colors.text,

      '--page-text':
        colors.text,

      '--muted':
        blockerMix(
          colors.text,
          colors.foreground,
          0.25
        ),

      '--secondary-text':
        colors.secondary,

      '--table-label':
        colors.headings,

      '--line':
        blockerMix(
          colors.foreground,
          colors.text,
          0.18
        ),

      '--primary':
        colors.accent,

      '--focus':
        colors.accent
    };
  };

  const blockerApplyVars = (vars) => {
    blockerClearVars();

    Object.entries(vars || {}).forEach(
      ([name, value]) => {
        if (
          /^--[a-z0-9-]+$/i.test(name) &&
          /^#[0-9a-f]{6}$/i.test(String(value))
        ) {
          document.documentElement
            .style
            .setProperty(name, value);
        }
      }
    );
  };

  const blockerReadThemeCustom = () => {
    try {
      return JSON.parse(
        blockerStoreGet(
          blockerCustomKey(
            blockerEffectiveTheme()
          ),
          'null'
        )
      );
    } catch (_) {
      return null;
    }
  };

  const blockerFields = {
    background: {
      label: 'Background',
      swatch:
        document.getElementById(
          'swatchBackground'
        ),
      value:
        document.getElementById(
          'valueBackground'
        )
    },

    foreground: {
      label: 'Foreground / Cards',
      swatch:
        document.getElementById(
          'swatchForeground'
        ),
      value:
        document.getElementById(
          'valueForeground'
        )
    },

    text: {
      label: 'Text',
      swatch:
        document.getElementById(
          'swatchText'
        ),
      value:
        document.getElementById(
          'valueText'
        )
    },

    secondary: {
      label: 'Secondary Text',
      swatch:
        document.getElementById(
          'swatchSecondary'
        ),
      value:
        document.getElementById(
          'valueSecondary'
        )
    },

    headings: {
      label: 'Table Headings',
      swatch:
        document.getElementById(
          'swatchHeadings'
        ),
      value:
        document.getElementById(
          'valueHeadings'
        )
    },

    accent: {
      label: 'Accent',
      swatch:
        document.getElementById(
          'swatchAccent'
        ),
      value:
        document.getElementById(
          'valueAccent'
        )
    }
  };

  let blockerPendingCustom = null;
  let blockerEditingField = null;

  const blockerLoadPending = () => {
    const saved =
      blockerReadThemeCustom();

    /*
     * IMPORTANT:
     * If this theme already has saved custom colors,
     * use them directly. Do NOT call blockerDefaultColors()
     * first because that clears the custom CSS variables
     * that were restored during page startup.
     */
    if (saved?.colors) {
      blockerPendingCustom = {
        ...saved.colors,

        secondary:
          saved.colors.secondary ||
          saved.vars?.['--secondary-text'] ||
          '#D3DEED',

        headings:
          saved.colors.headings ||
          saved.vars?.['--table-label'] ||
          '#B2D4EA'
      };

      return blockerPendingCustom;
    }

    blockerPendingCustom =
      blockerDefaultColors();

    return blockerPendingCustom;
  };

  const blockerDrawCustom = () => {
    const colors =
      blockerPendingCustom ||
      blockerLoadPending();

    Object.entries(
      blockerFields
    ).forEach(
      ([name, info]) => {
        if (info.swatch) {
          info.swatch.style.background =
            colors[name];
        }

        if (info.value) {
          info.value.textContent =
            colors[name];
        }
      }
    );

    if (blockerColorMessage) {
      const name =
        blockerEffectiveTheme() === 'dark'
          ? 'Dark'
          : 'Light';

      blockerColorMessage.textContent =
        `Editing ${name} theme colors.`;
    }
  };

  const blockerSetEditor = (
    hex
  ) => {
    const hsl =
      blockerHexToHsl(hex);

    blockerHue.value =
      String(hsl.h);

    blockerSaturation.value =
      String(hsl.s);

    blockerBrightness.value =
      String(hsl.l);

    blockerHex.value =
      hex.toUpperCase();

    blockerColorEditorPreview
      .style
      .background =
        hex;
  };

  const blockerSliderChanged = () => {
    const hex =
      blockerHslToHex(
        blockerHue.value,
        blockerSaturation.value,
        blockerBrightness.value
      );

    blockerHex.value = hex;

    blockerColorEditorPreview
      .style
      .background =
        hex;
  };

  const blockerOpenEditor = (
    field
  ) => {
    if (!blockerFields[field]) {
      return;
    }

    blockerEditingField = field;

    blockerColorEditorTitle.textContent =
      `Choose ${blockerFields[field].label}`;

    blockerSetEditor(
      (
        blockerPendingCustom ||
        blockerLoadPending()
      )[field]
    );

    blockerColorMainPanel.hidden = true;
    blockerColorEditor.hidden = false;
  };

  const blockerCloseEditor = () => {
    blockerEditingField = null;
    blockerColorEditor.hidden = true;
    blockerColorMainPanel.hidden = false;
  };

  const blockerApplyActiveTheme = () => {
    blockerClearVars();

    const mode =
      blockerStoreGet(
        BLOCKER_MODE_KEY,
        'default'
      );

    document.documentElement
      .dataset
      .palette =
        mode === 'custom'
          ? 'custom'
          : 'default';

    if (mode === 'custom') {
      const saved =
        blockerReadThemeCustom();

      if (saved?.vars) {
        blockerApplyVars(
          saved.vars
        );
      }
    }

    blockerPendingCustom = null;

    if (
      blockerColorPreset?.value === 'custom'
    ) {
      blockerLoadPending();
      blockerDrawCustom();
    }
  };

  const blockerMode =
    blockerStoreGet(
      BLOCKER_MODE_KEY,
      'default'
    );

  blockerColorPreset.value =
    blockerMode === 'custom'
      ? 'custom'
      : 'default';

  blockerCustomFields.hidden =
    blockerColorPreset.value !== 'custom';

  blockerApplyActiveTheme();

  if (
    blockerColorPreset.value === 'custom'
  ) {
    blockerLoadPending();
    blockerDrawCustom();
  }

  blockerColorPreset
    ?.addEventListener(
      'change',
      () => {
        if (
          blockerColorPreset.value ===
          'custom'
        ) {
          blockerCustomFields.hidden =
            false;

          blockerLoadPending();
          blockerDrawCustom();
        } else {
          blockerCustomFields.hidden =
            true;

          blockerColorMessage.textContent =
            'Default restores the built-in Light and Dark themes.';
        }
      }
    );

  document
    .querySelectorAll(
      '.advanced-color-button'
    )
    .forEach((button) => {
      button.addEventListener(
        'click',
        () => {
          if (blockerQuickPalette) {
            blockerQuickPalette.hidden =
              true;
          }

          blockerOpenEditor(
            button.dataset.colorTarget
          );
        }
      );
    });

  [
    blockerHue,
    blockerSaturation,
    blockerBrightness
  ].forEach((slider) => {
    slider?.addEventListener(
      'input',
      blockerSliderChanged
    );
  });

  /*
   * QUICK START COLOR:
   * Tap/click the large preview block, choose a nearby
   * starting color, then fine-tune with the sliders.
   */
  blockerColorEditorPreview
    ?.addEventListener(
      'click',
      () => {
        if (!blockerQuickPalette) {
          return;
        }

        blockerQuickPalette.hidden =
          !blockerQuickPalette.hidden;
      }
    );

  document
    .querySelectorAll(
      '.quick-color-swatch'
    )
    .forEach((swatch) => {
      const color =
        String(
          swatch.dataset.quickColor || ''
        )
          .trim()
          .toUpperCase();

      if (
        /^#[0-9A-F]{6}$/.test(color)
      ) {
        swatch.style.background =
          color;
      }

      swatch.addEventListener(
        'click',
        () => {
          if (
            !/^#[0-9A-F]{6}$/.test(color)
          ) {
            return;
          }

          blockerSetEditor(color);

          if (blockerQuickPalette) {
            blockerQuickPalette.hidden =
              true;
          }
        }
      );
    });

  blockerCancelColor
    ?.addEventListener(
      'click',
      () => {
        if (blockerQuickPalette) {
          blockerQuickPalette.hidden =
            true;
        }

        blockerCloseEditor();
      }
    );

  blockerHex
    ?.addEventListener(
      'input',
      () => {
        const value =
          String(
            blockerHex.value || ''
          )
            .trim()
            .toUpperCase();

        if (
          /^#[0-9A-F]{6}$/.test(value)
        ) {
          blockerSetEditor(value);
        }
      }
    );

  blockerUseColor
    ?.addEventListener(
      'click',
      () => {
        if (blockerQuickPalette) {
          blockerQuickPalette.hidden =
            true;
        }

        if (!blockerEditingField) {
          return;
        }

        const value =
          String(
            blockerHex.value || ''
          )
            .trim()
            .toUpperCase();

        if (
          !/^#[0-9A-F]{6}$/.test(value)
        ) {
          return;
        }

        blockerPendingCustom[
          blockerEditingField
        ] = value;

        blockerDrawCustom();

        /*
         * Retract individual color editor
         * back to the main Colors box.
         */
        blockerCloseEditor();

        blockerColorMessage.textContent =
          'Color selected. Choose another or tap Apply.';
      }
    );

  blockerApplyColors
    ?.addEventListener(
      'click',
      () => {
        if (
          blockerColorPreset.value ===
          'default'
        ) {
          /*
           * Default means BOTH themes return
           * to their built-in colors.
           */
          blockerStoreSet(
            BLOCKER_MODE_KEY,
            'default'
          );

          blockerStoreRemove(
            blockerCustomKey('dark')
          );

          blockerStoreRemove(
            blockerCustomKey('light')
          );

          blockerClearVars();

          document.documentElement
            .dataset
            .palette =
              'default';

          blockerPendingCustom = null;
        } else {
          const colors =
            blockerPendingCustom ||
            blockerLoadPending();

          const vars =
            blockerBuildVars(colors);

          /*
           * Save only the theme currently
           * being edited: Light or Dark.
           */
          blockerStoreSet(
            blockerCustomKey(
              blockerEffectiveTheme()
            ),
            JSON.stringify({
              colors,
              vars
            })
          );

          blockerStoreSet(
            BLOCKER_MODE_KEY,
            'custom'
          );

          document.documentElement
            .dataset
            .palette =
              'custom';

          blockerApplyVars(vars);
        }

        void blockerSaveAppearance()
          .catch(blockerSaveFailed);

        /*
         * Apply saves and retracts Colors.
         */
        blockerColorMenu.open = false;
      }
    );

  blockerResetColors
    ?.addEventListener(
      'click',
      () => {
        blockerStoreSet(
          BLOCKER_MODE_KEY,
          'default'
        );

        blockerStoreRemove(
          blockerCustomKey('dark')
        );

        blockerStoreRemove(
          blockerCustomKey('light')
        );

        blockerClearVars();

        document.documentElement
          .dataset
          .palette =
            'default';

        blockerColorPreset.value =
          'default';

        blockerCustomFields.hidden =
          true;

        blockerPendingCustom = null;

        void blockerSaveAppearance()
          .catch(blockerSaveFailed);

        /*
         * Reset restores built-in themes
         * and retracts Colors.
         */
        blockerColorMenu.open = false;
      }
    );

  document.addEventListener(
    'click',
    (event) => {
      if (
        blockerColorMenu?.open &&
        event.target instanceof Node &&
        !blockerColorMenu.contains(
          event.target
        )
      ) {
        blockerColorMenu.open = false;
      }
    }
  );

  const showNotice = (kind, message) => {
    noticeArea.innerHTML = `<div class="notice ${kind}">${escapeHtml(message)}</div>`;
    window.setTimeout(() => {
      if (noticeArea.textContent?.includes(message)) noticeArea.innerHTML = '';
    }, 5000);
  };

  const connectionActions = (link) => {
    const node = String(link?.node || '');
    const displayNode = String(link?.display_node || node);
    const canDisconnect = Boolean(link?.disconnectable)
      && /^[A-Za-z0-9_.:-]{1,64}$/.test(node);
    const canBlock = Boolean(link?.blockable ?? link?.actionable)
      && /^[0-9]{4,7}$/.test(node);

    if (!canDisconnect && !canBlock) {
      return '<span class="not-actionable">Display only</span>';
    }

    const buttons = [];
    if (canBlock) {
      buttons.push(`<button class="button danger small block-node" type="button" data-node="${escapeHtml(node)}">Block</button>`);
    }
    if (canDisconnect) {
      buttons.push(`<button class="button ghost small disconnect-node" type="button" data-node="${escapeHtml(node)}" data-display="${escapeHtml(displayNode)}">Disconnect</button>`);
    }

    return `<div class="row-actions ${buttons.length === 1 ? 'single-action' : ''}">${buttons.join('')}</div>`;
  };

  const linkRow = (link) => {
    const displayNode = String(link?.display_node || link?.node || 'Unknown');
    const mode = modeShort(link);
    const status = link?.keyed ? 'KEYED' : 'CONNECTED';
    const statusClass = link?.keyed ? 'status-keyed' : 'status-connected';

    const echoCallsign = mode === 'EchoLink'
      ? String(link?.callsign || '').trim()
      : '';

    const echoNode = mode === 'EchoLink'
      ? String(link?.echolink_node || link?.display_node || '').trim()
      : '';

    const nodeCallsign = mode === 'NODE'
      ? String(link?.callsign || '').trim()
      : '';

    const primaryIdentity = mode === 'EchoLink' && echoCallsign
      ? echoCallsign
      : displayNode;

    const primaryIdentityHtml = mode === 'NODE' && nodeCallsign
      ? `${escapeHtml(displayNode)} <span class="node-call-dot" aria-hidden="true">•</span> ${escapeHtml(nodeCallsign)}`
      : escapeHtml(primaryIdentity);

    const detail = mode === 'EchoLink'
      ? (echoNode ? `EchoLink ${echoNode}` : 'EchoLink connection')
      : mode === 'WT'
        ? 'Web Transceiver'
        : String(link?.mode_label || 'AllStar node');

    return `
      <div class="link-row ${link?.keyed ? 'is-keyed' : ''}">
        <div class="status-cell ${statusClass}">
          <span class="status-dot" aria-hidden="true"></span>
          <strong>${status}</strong>
        </div>
        <div class="identity-cell">
          <strong class="node-number">${primaryIdentityHtml}</strong>
          <span class="node-meta">${escapeHtml(detail)}</span>
        </div>
        <div class="mode-cell">
          <span class="mode-badge ${modeClass(mode)}">${escapeHtml(mode)}</span>
        </div>
        <div class="activity-cell">${escapeHtml(activityText(link))}</div>
        <div class="actions-cell">${connectionActions(link)}</div>
      </div>`;
  };

  const blockedRow = (item) => `
    <div class="blocked-row">
      <div class="identity-cell">
        <strong class="node-number">${escapeHtml(item.node)}</strong>
        <span class="node-meta">${escapeHtml(item.reason || 'Blocked')}</span>
      </div>
      <span class="blocked-status">BLOCKED</span>
      <button class="button success small restore-node" type="button" data-node="${escapeHtml(item.node)}">Restore</button>
    </div>`;

  const sortConnections = (connections) => [...connections].sort((a, b) => {
    const keyedDelta = Number(Boolean(b?.keyed)) - Number(Boolean(a?.keyed));
    if (keyedDelta !== 0) return keyedDelta;
    return String(a?.display_node || a?.node || '').localeCompare(String(b?.display_node || b?.node || ''), undefined, { numeric: true });
  });

  const setFilter = (filter) => {
    currentFilter = ['all', 'keyed', 'connected', 'blocked'].includes(filter) ? filter : 'all';
    filterButtons.forEach((button) => {
      const active = button.dataset.filter === currentFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    renderLists();
  };

  const renderLists = () => {
    const connections = sortConnections(Array.isArray(snapshot.connections) ? snapshot.connections : []);
    const blocked = Array.isArray(snapshot.blocked) ? snapshot.blocked : [];

    if (currentFilter === 'blocked') {
      livePanel.classList.add('hidden');
      blockedPanel.classList.remove('hidden');
      blockedList.innerHTML = blocked.length
        ? blocked.map(blockedRow).join('')
        : '<div class="empty-state good-state">No nodes are blocked.</div>';
      return;
    }

    livePanel.classList.remove('hidden');
    blockedPanel.classList.add('hidden');

    let visible = connections;
    if (currentFilter === 'keyed') visible = connections.filter((link) => Boolean(link?.keyed));
    if (currentFilter === 'connected') visible = connections;

    liveHeading.textContent = currentFilter === 'keyed'
      ? 'Keyed Now'
      : currentFilter === 'connected'
        ? 'Connected'
        : 'All Connections';

    liveList.innerHTML = visible.length
      ? visible.map(linkRow).join('')
      : `<div class="empty-state good-state">${currentFilter === 'keyed' ? 'No connected node is keyed.' : 'No matching live connections.'}</div>`;
  };

  const render = (data) => {
    const connections = Array.isArray(data.connections) ? data.connections : [];
    const keyed = Array.isArray(data.keyed) ? data.keyed : connections.filter((link) => link.keyed);
    const blocked = Array.isArray(data.blocked) ? data.blocked : [];

    snapshot = { connections, keyed, blocked };
    allCount.textContent = String(connections.length);
    keyedCount.textContent = String(keyed.length);
    connectedCount.textContent = String(connections.length);
    blockedCount.textContent = String(blocked.length);

    renderLists();

    const allowCount = Number(data.allowlistCount || 0);
    if (allowCount > 0) {
      allowlistText.textContent = `This node has ${allowCount} allowlist ${allowCount === 1 ? 'entry' : 'entries'}. Review that policy because it can supersede denylist behavior.`;
      allowlistWarning.classList.remove('hidden');
    } else {
      allowlistWarning.classList.add('hidden');
    }

    if (data.statusError) {
      statusWarning.textContent = `Live keyed status: ${data.statusError}`;
      statusWarning.classList.remove('hidden');
    } else {
      statusWarning.classList.add('hidden');
    }

    if (lastUpdate) lastUpdate.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
  };

  const refreshStatus = async () => {
    if (busy) return;
    try {
      const response = await fetch(`status.php?_=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });

      if (response.status === 401) {
        window.location.href = 'login.php';
        return;
      }

      const data = await response.json();
      render(data);
    } catch (_) {
      if (lastUpdate) lastUpdate.textContent = 'Live status retrying…';
    }
  };

  const openConfirm = (action, target, reason = '', displayTarget = '') => {
    pending = { action, target, reason, displayTarget };
    confirmReason.value = reason;
    const visibleTarget = displayTarget || target;

    if (action === 'block') {
      confirmMessage.textContent = `Disconnect node ${target} now and block it from reconnecting?`;
      reasonWrap.classList.remove('hidden');
      confirmGo.textContent = 'Block Node';
      confirmGo.className = 'button danger';
    } else if (action === 'disconnect') {
      confirmMessage.textContent = `Disconnect ${visibleTarget} now without blocking it?`;
      reasonWrap.classList.add('hidden');
      confirmGo.textContent = 'Disconnect Only';
      confirmGo.className = 'button ghost';
    } else {
      confirmMessage.textContent = `Restore access for node ${target}?`;
      reasonWrap.classList.add('hidden');
      confirmGo.textContent = 'Restore Access';
      confirmGo.className = 'button success';
    }

    dialog.classList.remove('hidden');
    confirmGo.focus();
  };

  const closeConfirm = () => {
    dialog.classList.add('hidden');
    pending = null;
  };

  const doAction = async (action, target, reason = '', displayTarget = '') => {
    busy = true;

    try {
      const response = await fetch('action.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Accept: 'application/json'
        },
        body: new URLSearchParams({ csrf, action, target, reason })
      });

      if (response.status === 401) {
        window.location.href = 'login.php';
        return;
      }

      const data = await response.json();
      let message = data.message || 'Action failed.';

      if (data.ok
          && action === 'disconnect'
          && /^\d{1,6}$/.test(displayTarget)
          && displayTarget !== target) {
        message = `EchoLink ${displayTarget} was disconnected. It was not blocked.`;
      }

      showNotice(data.ok ? 'success' : 'error', message);
    } catch (_) {
      showNotice('error', 'The request could not be completed.');
    } finally {
      busy = false;
      await refreshStatus();
    }
  };

  const listClick = (event) => {
    const disconnect = event.target.closest('.disconnect-node');
    if (disconnect) {
      openConfirm('disconnect', disconnect.dataset.node || '', '', disconnect.dataset.display || '');
      return;
    }

    const block = event.target.closest('.block-node');
    if (block) {
      openConfirm('block', block.dataset.node || '');
      return;
    }

    const restore = event.target.closest('.restore-node');
    if (restore) {
      openConfirm('restore', restore.dataset.node || '');
    }
  };

  liveList.addEventListener('click', listClick);
  blockedList.addEventListener('click', listClick);
  filterButtons.forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.filter || 'all')));

  manualForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(manualForm);
    const target = String(data.get('target') || '').trim();
    const reason = String(data.get('reason') || '').trim();

    if (!/^[0-9]{4,7}$/.test(target)) {
      showNotice('error', 'Enter a valid 4 to 7 digit AllStar node number.');
      return;
    }
    if (target === localNode) {
      showNotice('error', 'You cannot block your own node.');
      return;
    }

    openConfirm('block', target, reason);
  });

  confirmCancel.addEventListener('click', closeConfirm);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeConfirm();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dialog.classList.contains('hidden')) closeConfirm();
  });

  confirmGo.addEventListener('click', async () => {
    if (!pending) return;

    const action = pending.action;
    const target = pending.target;
    const reason = action === 'block' ? confirmReason.value.trim() : '';
    const displayTarget = pending.displayTarget || '';

    closeConfirm();
    await doAction(action, target, reason, displayTarget);
    manualForm?.reset();
  });

  refreshStatus();
  pollTimer = window.setInterval(refreshStatus, 1000);

  window.addEventListener('pagehide', () => {
    if (pollTimer) window.clearInterval(pollTimer);
  }, { once: true });
})();

// GitHub version check. Failure is silent and never affects Blocker operation.
(() => {
  'use strict';

  const parseVersion = (value) => {
    const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/i);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };

  const newer = (remote, local) => {
    const a = parseVersion(remote);
    const b = parseVersion(local);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i += 1) {
      if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
  };

  const check = async () => {
    const brand = document.getElementById('branding-title');
    if (!brand) return;

    const local = String(brand.dataset.localVersion || '').trim();
    const url = String(brand.dataset.versionUrl || '').trim();

    if (local) brand.title = `ASL3 Node Blocker & Restore v${local}`;
    if (!local || !url) return;

    try {
      const response = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!response.ok) return;

      const remote = String(await response.text()).trim();
      if (newer(remote, local)) {
        brand.classList.add('has-update');
        brand.title = `ASL3 Node Blocker & Restore v${local} → v${remote} update available`;
        brand.setAttribute('aria-label', `Open repository. Update available: v${local} to v${remote}.`);
      }
    } catch (_) {
      // Silent by design.
    }
  };

  check();
  window.setInterval(check, 15 * 60 * 1000);
})();
