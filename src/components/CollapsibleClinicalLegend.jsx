import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  BookOpen,
  Search,
  X,
  ShieldCheck,
} from 'lucide-react';
import { PEDIGREE_NOMENCLATURE_ITEMS } from '../domain/pedigreeNomenclature.js';

/**
 * SVG Renderer for symbols inside legend
 */
export function LegendSymbolGlyph({ type, isDark = false, size = 26 }) {
  const stroke = isDark ? '#94a3b8' : '#334155';
  const baseBg = isDark ? '#1e293b' : '#ffffff';
  const aff = isDark ? '#f43f5e' : '#e11d48';
  const carr = isDark ? '#f59e0b' : '#d97706';

  const halfSize = size / 2;
  const viewBox = `-${halfSize} -${halfSize} ${size} ${size}`;

  const renderContent = () => {
    switch (type) {
      case 'sq':
        return <rect x={-8} y={-8} width={16} height={16} rx={2} fill={baseBg} stroke={stroke} strokeWidth={1.8} />;
      case 'ci':
        return <circle r={8} fill={baseBg} stroke={stroke} strokeWidth={1.8} />;
      case 'di':
        return <polygon points="-8,0 0,-8 8,0 0,8" fill={baseBg} stroke={stroke} strokeWidth={1.8} />;
      case 'slash':
        return (
          <g>
            <rect x={-8} y={-8} width={16} height={16} rx={2} fill={baseBg} stroke={stroke} strokeWidth={1.5} />
            <line x1={-9} y1={-9} x2={9} y2={9} stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
          </g>
        );
      case 'aff':
        return <rect x={-8} y={-8} width={16} height={16} rx={2} fill={aff} stroke={stroke} strokeWidth={1.8} />;
      case 'carrier_ar':
        return (
          <g>
            <rect x={-8} y={-8} width={16} height={16} rx={2} fill={baseBg} />
            <rect x={0} y={-8} width={8} height={16} fill={carr} />
            <line x1={0} y1={-8} x2={0} y2={8} stroke={stroke} strokeWidth={1.4} />
            <rect x={-8} y={-8} width={16} height={16} rx={2} fill="none" stroke={stroke} strokeWidth={1.8} />
          </g>
        );
      case 'mut':
        return (
          <g>
            <circle r={8} fill={baseBg} stroke={stroke} strokeWidth={1.8} />
            <circle r={3.5} fill="#0284c7" />
          </g>
        );
      case 'proband':
        return (
          <g>
            <rect x={-6} y={-6} width={12} height={12} rx={2} fill={baseBg} stroke={stroke} strokeWidth={1.5} />
            <g transform="translate(-1, 1)">
              <line x1={-8} y1={8} x2={-2} y2={2} stroke="#2563eb" strokeWidth={1.8} strokeLinecap="round" />
              <polygon points="-1,1 -5,2 -2,5" fill="#2563eb" />
              <circle cx={-10} cy={10} r={4.5} fill="#2563eb" />
              <text x={-10} y={12} textAnchor="middle" fill="#ffffff" className="text-[6.5px] font-bold font-mono">P</text>
            </g>
          </g>
        );
      case 'risk_badge':
        return (
          <g>
            <rect x={-7} y={-7} width={14} height={14} rx={2} fill={baseBg} stroke={stroke} strokeWidth={1.4} />
            <circle cx={6} cy={-6} r={5} fill="#fef3c7" stroke="#d97706" strokeWidth={1.2} />
            <path d="M6 -7.5 L6 -5.5 M6 -4.5 L6 -4" stroke="#d97706" strokeWidth={1.2} strokeLinecap="round" />
          </g>
        );
      case 'mat':
        return (
          <g>
            <rect x={-10} y={-4} width={6} height={8} fill={baseBg} stroke={stroke} strokeWidth={1.2} />
            <line x1={-4} y1={0} x2={4} y2={0} stroke={stroke} strokeWidth={2} />
            <circle cx={0} cy={0} r={1.8} fill={stroke} />
            <circle cx={7} cy={0} r={3.5} fill={baseBg} stroke={stroke} strokeWidth={1.2} />
          </g>
        );
      case 'consang':
        return (
          <g>
            <rect x={-10} y={-5} width={6} height={8} fill={baseBg} stroke={stroke} strokeWidth={1.2} />
            <line x1={-4} y1={-2} x2={4} y2={-2} stroke={stroke} strokeWidth={1.6} />
            <line x1={-4} y1={2} x2={4} y2={2} stroke={stroke} strokeWidth={1.6} />
            <circle cx={7} cy={0} r={3.5} fill={baseBg} stroke={stroke} strokeWidth={1.2} />
          </g>
        );
      case 'twin_mz':
        return (
          <g>
            <path d="M-8,7 L0,-4 L8,7" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
            <line x1={-4} y1={1.5} x2={4} y2={1.5} stroke={stroke} strokeWidth={1.8} />
          </g>
        );
      case 'twin_dz':
        return <path d="M-8,7 L0,-4 L8,7" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />;
      case 'gen_num':
        return (
          <g>
            <rect x={-9} y={-5} width={18} height={10} rx={2} fill={isDark ? '#334155' : '#e2e8f0'} stroke={stroke} strokeWidth={1} />
            <text x={0} y={2.5} textAnchor="middle" fill={isDark ? '#cbd5e1' : '#334155'} className="text-[7.5px] font-mono font-bold">III</text>
          </g>
        );
      default:
        return <circle r={6} fill={baseBg} stroke={stroke} strokeWidth={1.5} />;
    }
  };

  return (
    <svg width={size} height={size} viewBox={viewBox} className="shrink-0" aria-hidden="true">
      {renderContent()}
    </svg>
  );
}

/**
 * Collapsible Legend Component with Detailed Clinical Interpretation Guide
 */
export default function CollapsibleClinicalLegend({ isDark = false, defaultExpanded = false }) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = [
    { id: 'all', label: 'همه علائم (ACMG)' },
    { id: 'shapes', label: 'اشخاص و جنسیت' },
    { id: 'shading', label: 'الگوهای سایه‌زنی و ناقلین' },
    { id: 'kinship', label: 'روابط و خویشاوندی' },
  ];

  const filteredItems = useMemo(() => {
    return PEDIGREE_NOMENCLATURE_ITEMS.filter((item) => {
      const matchCat = activeCategory === 'all' || item.category === activeCategory;
      if (!matchCat) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.title.toLowerCase().includes(q) ||
        item.symbolLabel.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.clinicalInterpretation.toLowerCase().includes(q)
      );
    });
  }, [activeCategory, searchQuery]);

  return (
    <div
      dir="rtl"
      data-testid="collapsible-clinical-legend"
      className={`transition-all duration-200 select-none ${
        isOpen
          ? 'w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl border shadow-xl backdrop-blur-md'
          : 'rounded-xl border shadow-xs backdrop-blur-sm'
      } ${
        isDark
          ? 'border-slate-800 bg-slate-900/95 text-slate-100'
          : 'border-slate-200 bg-white/95 text-slate-800'
      }`}>
      {/* Header bar - Always Visible */}
      <div
        className={`flex items-center justify-between p-2.5 cursor-pointer transition ${
          isOpen
            ? `border-b ${isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50/70'}`
            : 'hover:bg-slate-50/50'
        }`}
        onClick={() => setIsOpen((prev) => !prev)}
        role="button"
        aria-expanded={isOpen}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg shrink-0 ${isDark ? 'bg-blue-950/80 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
            <BookOpen size={15} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-tight">راهنمای علائم بالینی (ACMG)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-500 font-semibold border border-blue-500/20">
                NSGC
              </span>
            </div>
            {!isOpen && (
              <p className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                استاندارد نام‌گذاری و تفسیر بالینی نمادها و سایه‌زنی
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isOpen && (
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 ml-1">
              <span className="font-mono font-semibold">{PEDIGREE_NOMENCLATURE_ITEMS.length}</span> نماد
            </div>
          )}
          <button
            type="button"
            className={`p-1 rounded-lg text-slate-400 hover:text-slate-200 transition ${
              isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
            }`}
            aria-label={isOpen ? 'بستن راهنما' : 'باز کردن راهنما'}>
            {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {/* Collapsed Compact Preview Bar (Quick glance at primary symbols) */}
      {!isOpen && (
        <div className={`px-2.5 pb-2.5 pt-0.5 flex items-center gap-2 overflow-x-auto text-[11px] ${
          isDark ? 'text-slate-300' : 'text-slate-600'
        }`}>
          {[
            { t: 'sq', label: 'مرد' },
            { t: 'ci', label: 'زن' },
            { t: 'aff', label: 'مبتلا' },
            { t: 'carrier_ar', label: 'ناقل (AR)' },
            { t: 'proband', label: 'پروباند (P)' },
            { t: 'consang', label: 'خویشاوندی' },
          ].map((item, idx) => (
            <div key={idx} className="flex items-center gap-1 shrink-0">
              <LegendSymbolGlyph type={item.t} isDark={isDark} size={15} />
              <span className="text-[10.5px] font-medium">{item.label}</span>
              {idx < 5 && <span className="text-slate-400/40 mr-1">·</span>}
            </div>
          ))}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(true);
            }}
            className="text-[10px] text-blue-500 hover:underline shrink-0 mr-auto font-medium">
            تفسیر بالینی...
          </button>
        </div>
      )}

      {/* Expanded Content with Detailed Clinical Interpretation */}
      {isOpen && (
        <div className="p-3 space-y-3">
          {/* Search & Category Filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو در نام نماد، سایه‌زنی یا مفهوم بالینی..."
                className={`w-full rounded-xl border py-1.5 pr-8 pl-7 text-xs outline-none transition ${
                  isDark
                    ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-blue-500'
                    : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-blue-500 focus:bg-white'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-200">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Category Segmented Tabs */}
            <div className={`flex rounded-xl p-1 gap-1 text-[11px] overflow-x-auto ${
              isDark ? 'bg-slate-950 border border-slate-800' : 'bg-slate-100 border border-slate-200'
            }`}>
              {categories.map((cat) => {
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition ${
                      isActive
                        ? (isDark ? 'bg-slate-800 text-blue-400 shadow-xs' : 'bg-white text-blue-600 shadow-xs')
                        : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                    }`}>
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Symbols List */}
          <div className="scroll-lab max-h-[310px] overflow-y-auto space-y-2 pr-0.5">
            {filteredItems.length === 0 ? (
              <div className={`py-6 text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                هیچ نمادی مطابق با جستجو پیدا نشد
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border p-2.5 transition text-xs ${
                    isDark
                      ? 'border-slate-800/80 bg-slate-950/40 hover:bg-slate-950/80'
                      : 'border-slate-100 bg-slate-50/70 hover:bg-slate-50'
                  }`}>
                  <div className="flex items-start gap-2.5">
                    <div className="pt-0.5">
                      <LegendSymbolGlyph type={item.type} isDark={isDark} size={28} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="font-bold text-xs leading-none">{item.title}</h4>
                        <span className={`text-[9.5px] font-mono px-1 rounded ${
                          isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {item.symbolLabel}
                        </span>
                      </div>
                      <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        {item.description}
                      </p>
                      {item.clinicalInterpretation && (
                        <div className={`mt-1.5 rounded-lg p-2 text-[10.5px] leading-relaxed border ${
                          isDark
                            ? 'bg-blue-950/30 border-blue-900/40 text-blue-300'
                            : 'bg-blue-50/70 border-blue-100 text-blue-900'
                        }`}>
                          <span className="font-bold ml-1 text-blue-500">تفسیر بالینی:</span>
                          {item.clinicalInterpretation}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Clinical Interpretation Notice & Disclaimer */}
          <div className={`rounded-xl border p-2.5 text-[10.5px] space-y-1.5 ${
            isDark ? 'border-amber-900/40 bg-amber-950/20 text-amber-200/90' : 'border-amber-200 bg-amber-50/80 text-amber-900'
          }`}>
            <div className="flex items-center gap-1.5 font-bold text-xs text-amber-500">
              <ShieldCheck size={14} />
              <span>اصول دقت تفسیر بالینی شجره‌نامه (ACMG):</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[10px] leading-relaxed opacity-90">
              <li>
                <strong>تفکیک فنوتیپ و ژنوتیپ:</strong> پر بودن نیمی از نماد فقط نشان‌دهنده ناقل هتروزیگوت مغلوب است و هرگز نباید با ابتلای بالینی یکسان فرض شود.
              </li>
              <li>
                <strong>ازدواج خویشاوندی:</strong> خط دوگانه نشان‌دهنده نسبت فامیلی و افزایش چشمگیر ضریب همخونی برای بیماری‌های مغلوب است.
              </li>
              <li>
                <strong>جنبه آموزشی:</strong> شبیه‌سازی و نمادها برای کاربری بالینی-آموزشی بوده و جایگزین آزمون‌های مولکولی یا مشاوره ژنتیک پزشکی نیست.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
