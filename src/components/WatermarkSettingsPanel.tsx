import React, { useRef } from 'react';
import { Type, Image as ImageIcon, Layout, Sliders, Hash, ShieldCheck, Upload, X, Eye } from 'lucide-react';
import { WatermarkConfig, WatermarkPlacement } from '../types';

interface WatermarkSettingsPanelProps {
  config: WatermarkConfig;
  onChange: (updates: Partial<WatermarkConfig>) => void;
}

const FONTS = [
  { name: 'Sans-Serif (Default)', value: 'Inter, system-ui, sans-serif' },
  { name: 'Monospace Tech', value: '"JetBrains Mono", monospace' },
  { name: 'Display Modern', value: 'Outfit, sans-serif' },
  { name: 'Elegant Serif', value: '"Playfair Display", serif' },
];

const PRESET_COLORS = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Black', value: '#000000' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Emerald', value: '#10B981' },
];

const PLACEMENTS: { label: string; value: WatermarkPlacement }[] = [
  { label: 'Top-Left', value: 'top-left' },
  { label: 'Top-Right', value: 'top-right' },
  { label: 'Center', value: 'center' },
  { label: 'Bottom-Left', value: 'bottom-left' },
  { label: 'Bottom-Right', value: 'bottom-right' },
  { label: 'Tiled Grid', value: 'tile' },
  { label: 'Custom Pointer', value: 'custom' },
];

export const WatermarkSettingsPanel: React.FC<WatermarkSettingsPanelProps> = ({ config, onChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      onChange({
        logoUrl: url,
        logoName: file.name
      });
    }
  };

  const removeLogo = () => {
    if (config.logoUrl) {
      URL.revokeObjectURL(config.logoUrl);
    }
    onChange({
      logoUrl: null,
      logoName: null
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.01)] flex flex-col gap-6" id="watermark-settings-panel">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-1">
          <Sliders className="w-4 h-4 text-slate-400" />
          Watermark Asset Config
        </h3>
        <p className="text-xs text-slate-400">Design your secure watermarking stamp template</p>
      </div>

      {/* Tabs for TEXT vs IMAGE */}
      <div className="grid grid-cols-2 p-1 bg-slate-50 border border-slate-100 rounded-xl" id="watermark-type-toggle">
        <button
          onClick={() => onChange({ type: 'text' })}
          className={`flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            config.type === 'text'
              ? 'bg-white text-slate-800 shadow-sm border border-slate-100'
              : 'text-slate-400 hover:text-slate-800'
          }`}
          id="btn-type-text"
        >
          <Type className="w-3.5 h-3.5" />
          Clean Text
        </button>
        <button
          onClick={() => onChange({ type: 'image' })}
          className={`flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            config.type === 'image'
              ? 'bg-white text-slate-800 shadow-sm border border-slate-100'
              : 'text-slate-400 hover:text-slate-800'
          }`}
          id="btn-type-image"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Upload Logo
        </button>
      </div>

      {/* Conditionally Render Content Settings */}
      {config.type === 'text' ? (
        <div className="space-y-4" id="text-settings-container">
          {/* Text input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500">Watermark Text</label>
            <input
              type="text"
              value={config.text}
              onChange={(e) => onChange({ text: e.target.value })}
              className="w-full px-3 py-2 border border-slate-250 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-slate-50/30 font-display font-medium"
              placeholder="e.g. STRICTLY CONFIDENTIAL"
              id="input-watermark-text"
            />
          </div>

          {/* Typography */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500">Font Family</label>
              <select
                value={config.fontFamily}
                onChange={(e) => onChange({ fontFamily: e.target.value })}
                className="w-full px-2 py-2 border border-slate-200 bg-white rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                id="select-font-family"
              >
                {FONTS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500">Font Size ({config.fontSize}px)</label>
              <input
                type="range"
                min="10"
                max="120"
                value={config.fontSize}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
                className="w-full mt-2 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                id="range-font-size"
              />
            </div>
          </div>

          {/* Color pickers */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-500">Text Color</label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => onChange({ textColor: color.value })}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                  className={`w-6 h-6 rounded-full border transition-transform ${
                    config.textColor === color.value
                      ? 'scale-110 border-slate-900 ring-1 ring-slate-900'
                      : 'border-slate-200 hover:scale-105'
                  }`}
                  id={`preset-color-${color.name.toLowerCase()}`}
                />
              ))}
              <div className="relative flex items-center gap-1.5 ml-1">
                <input
                  type="color"
                  value={config.textColor}
                  onChange={(e) => onChange({ textColor: e.target.value })}
                  className="w-7 h-7 p-0 rounded-md border border-slate-200 cursor-pointer"
                  id="picker-custom-color"
                />
                <input
                  type="text"
                  maxLength={7}
                  value={config.textColor.toUpperCase()}
                  onChange={(e) => onChange({ textColor: e.target.value })}
                  className="w-16 px-1.5 py-1 border border-slate-200 rounded text-[11px] font-mono"
                  id="input-hex-color"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-in" id="image-settings-container">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500">Custom Stamp Logo</label>
            
            {config.logoUrl ? (
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg" id="logo-uploaded-preview">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-8 h-8 rounded bg-white flex items-center justify-center p-1 border border-slate-100">
                    <img src={config.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-slate-700 truncate max-w-[150px]">
                      {config.logoName || 'Logo Image'}
                    </p>
                    <p className="text-[10px] text-slate-400">Stamp Active</p>
                  </div>
                </div>
                <button
                  onClick={removeLogo}
                  className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100 transition-colors"
                  id="btn-remove-logo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 py-5 px-3 border border-dashed border-slate-200 rounded-xl hover:border-slate-900 hover:bg-slate-50/50 transition-all text-slate-400"
                  id="btn-trigger-logo-upload"
                >
                  <Upload className="w-5 h-5 text-slate-350" />
                  <span className="text-xs font-semibold text-slate-700">Upload Watermark Graphic</span>
                  <span className="text-[10px] text-slate-350">Supports PNG, JPG, JPEG, SVG</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLogoUpload}
                  accept="image/png, image/jpeg, image/jpg, image/svg+xml"
                  className="hidden"
                  id="input-logo-file"
                />
              </div>
            )}
          </div>

          {/* Logo Scale */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-500">
              <span>Graphic Scale multiplier</span>
              <span>{Math.round(config.scale * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.5"
              step="0.05"
              value={config.scale}
              onChange={(e) => onChange({ scale: Number(e.target.value) })}
              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              id="range-logo-scale"
            />
          </div>
        </div>
      )}

      {/* Grid Placement settings */}
      <div className="space-y-4 pt-4 border-t border-slate-100" id="placement-settings">
        <div>
          <h4 className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-2">
            <Layout className="w-3.5 h-3.5 text-slate-400" />
            Core Placement & Alignment
          </h4>
          <div className="grid grid-cols-3 gap-2" id="grid-placements">
            {PLACEMENTS.map((place) => (
              <button
                key={place.value}
                onClick={() => onChange({ placement: place.value })}
                className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border transition-all truncate text-center ${
                  config.placement === place.value
                    ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
                id={`btn-placement-${place.value}`}
              >
                {place.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom coordinates sliders (Only visible if placement is 'custom' or as offsets for others) */}
        {config.placement === 'custom' && (
          <div className="grid grid-cols-2 gap-3 animate-fade-in" id="custom-position-sliders">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500">X Position ({config.customX}%)</span>
              <input
                type="range"
                min="0"
                max="100"
                value={config.customX}
                onChange={(e) => onChange({ customX: Number(e.target.value) })}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-950"
                id="range-custom-offset-x"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500">Y Position ({config.customY}%)</span>
              <input
                type="range"
                min="0"
                max="100"
                value={config.customY}
                onChange={(e) => onChange({ customY: Number(e.target.value) })}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-950"
                id="range-custom-offset-y"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* Opacity slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-500">
              <span>Watermark Opacity</span>
              <span>{Math.round(config.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="1.0"
              step="0.05"
              value={config.opacity}
              onChange={(e) => onChange({ opacity: Number(e.target.value) })}
              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-950"
              id="range-watermark-opacity"
            />
          </div>

          {/* Rotation angle slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-500">
              <span>Rotation Angle</span>
              <span>{config.rotation}°</span>
            </div>
            <input
              type="range"
              min="-180"
              max="180"
              step="5"
              value={config.rotation}
              onChange={(e) => onChange({ rotation: Number(e.target.value) })}
              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-950"
              id="range-watermark-rotation"
            />
          </div>
        </div>
      </div>

      {/* Active Protection Layers */}
      <div className="pt-4 border-t border-slate-100 flex flex-col gap-4" id="layer-toggles">
        {/* Visible Layer Control */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-2">
            <Eye className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-semibold text-slate-800 leading-tight">
                Visible Watermark Overlay
              </h4>
              <p className="text-[10px] text-slate-400 leading-normal mt-1">
                Display custom text or visual logo image over the target asset. Toggle off to keep image clean.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.enableVisibleWatermark}
              onChange={(e) => onChange({ enableVisibleWatermark: e.target.checked })}
              className="sr-only peer"
              id="check-enable-visible-watermark"
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
          </label>
        </div>

        {/* Steganographic Layer Selector */}
        <div className="flex flex-col gap-3 pt-4 border-t border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-2">
              <ShieldCheck className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-slate-800 leading-tight">
                  Invisible Stego Layer Verification
                </h4>
                <p className="text-[10px] text-slate-400 leading-normal mt-1">
                  Embed a digital hidden signature into pixel channels. This can be verified later.
                  (PNG lossless recommended)
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.embedSteganography}
                onChange={(e) => onChange({ embedSteganography: e.target.checked })}
                className="sr-only peer"
                id="check-embed-steganography"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
            </label>
          </div>

          {config.embedSteganography && (
            <div className="pl-7 flex flex-col gap-1.5 animate-fade-in" id="stego-owner-input-container">
              <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                Custom Digital Seal / Owner ID
              </label>
              <input
                type="text"
                placeholder="e.g. Baq (baq011016@gmail.com)"
                value={config.stegoOwner || ''}
                onChange={(e) => onChange({ stegoOwner: e.target.value })}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-200 focus:outline-none focus:border-slate-500 rounded-lg text-slate-800 bg-white"
                id="input-stego-owner"
                maxLength={80}
              />
              <p className="text-[10px] text-slate-450 font-sans leading-normal">
                Matches your digital identity. Hidden cryptographically so you can legally declare and prove ownership when verified.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
