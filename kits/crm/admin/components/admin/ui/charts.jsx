// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/ui/charts.jsx, oct. 2026. À adapter : voir BRIQUE.md.
"use client";

import { useId } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

// Graphiques de l'admin. Repris de « Charts & KPI Cards » de 21st.dev (uvain, système Layro), sur Recharts, aux
// couleurs de la marque. Règles gardées du modèle :
//   · la couleur suit la série dans un ordre fixe (SLOTS), jamais son rang ;
//   · un seul axe vertical ; traits fins (2 px), barres ≤ 24 px aux coins arrondis, aires en voile léger ;
//   · les textes ne prennent jamais la couleur de la série : une pastille à côté porte l'identité ;
//   · deux séries ou plus → légende ; chaque graphique a une info-bulle ET un tableau caché pour les lecteurs
//     d'écran : rien ne dépend de la couleur ni du survol.
// Textes d'au moins 12 px ; couleurs = jetons brand de tailwind.config.js, recopiés en hexadécimal ci-dessous
// (Recharts dessine en SVG et ne lit pas les classes Tailwind) : À ADAPTER avec la palette de la marque.

// Marine, or, or foncé, beige, gris chaud : assez d'écart de clarté pour se distinguer sans la teinte.
export const SLOTS = ["#10243B", "#B8860B", "#9A6F08", "#DECFAE", "#625E57"];
const GRID = "#DECFAE";
const AXIS = { fill: "#625E57", fontSize: 12 };
const defaultFormat = (v) => Number(v).toLocaleString("fr-CA");
const colorOf = (s, i) => SLOTS[(s.slot ?? i + 1) - 1] || SLOTS[i % SLOTS.length];

// Carte de graphique : titre, sous-titre, actions à droite, puis le graphique.
export function ChartCard({ title, subtitle, actions, className, children, ...rest }) {
    return (
        <figure
            className={cn("m-0 flex min-w-0 flex-col gap-4 rounded-2xl border border-brand-beige bg-white p-5 shadow-subtle sm:p-6", className)}
            {...rest}
        >
            <figcaption className="flex flex-wrap items-start justify-between gap-3">
                <span className="flex flex-col gap-1">
                    <span className="text-base font-bold text-brand-night">{title}</span>
                    {subtitle && <span className="text-sm text-brand-warmgray">{subtitle}</span>}
                </span>
                {actions}
            </figcaption>
            {children}
        </figure>
    );
}

function Legend({ series }) {
    if (series.length < 2) return null;
    return (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-hidden="true">
            {series.map((s, i) => (
                <li key={s.key} className="flex items-center gap-1.5 text-xs font-medium text-brand-warmgray">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colorOf(s, i) }} />
                    {s.label}
                </li>
            ))}
        </ul>
    );
}

function ChartTooltip({ active, payload, label, series, format, labelFormat }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="min-w-[150px] rounded-xl border border-brand-beige bg-white px-3 py-2 text-xs text-brand-anthracite shadow-premium">
            {label !== undefined && <p className="mb-1.5 font-bold text-brand-night">{labelFormat ? labelFormat(String(label)) : label}</p>}
            <ul className="grid gap-1">
                {payload.map((p, idx) => {
                    const i = series.findIndex((s) => s.key === p.dataKey);
                    const s = series[i] ?? { key: String(p.name ?? idx), label: String(p.name ?? "") };
                    const swatch = i >= 0 ? colorOf(s, i) : p.payload?.fill || p.color;
                    return (
                        <li key={s.key} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-brand-warmgray">
                                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: swatch }} />
                                {s.label}
                            </span>
                            <span className="font-bold tabular-nums text-brand-night">{format(Number(p.value))}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function DataTable({ caption, data, xKey, xLabel, xFormat, series, format }) {
    return (
        <div className="sr-only">
            <table>
                <caption>{caption}</caption>
                <thead>
                    <tr>
                        <th scope="col">{xLabel || xKey}</th>
                        {series.map((s) => (
                            <th key={s.key} scope="col">
                                {s.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr key={i}>
                            <th scope="row">{xFormat ? xFormat(String(row[xKey])) : String(row[xKey])}</th>
                            {series.map((s) => (
                                <td key={s.key}>{format(Number(row[s.key]))}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Courbe en aire. data = [{ [xKey]: …, [serie.key]: nombre }], series = [{ key, label, slot? }].
export function AreaTrend({ data, xKey, xLabel, series, format = defaultFormat, xFormat, height = 240, description, className }) {
    const id = useId().replace(/:/g, "");
    return (
        <div className={cn("grid gap-3", className)}>
            <Legend series={series} />
            <div role="img" aria-label={description} style={{ height }}>
                <div aria-hidden="true" className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <defs>
                                {series.map((s, i) => (
                                    <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={colorOf(s, i)} stopOpacity={0.18} />
                                        <stop offset="100%" stopColor={colorOf(s, i)} stopOpacity={0.02} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 4" />
                            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={AXIS} tickMargin={8} tickFormatter={xFormat} minTickGap={24} />
                            <YAxis tickLine={false} axisLine={false} tick={AXIS} tickFormatter={format} width={36} allowDecimals={false} />
                            <Tooltip cursor={{ stroke: "#625E57", strokeWidth: 1 }} content={<ChartTooltip series={series} format={format} labelFormat={xFormat} />} />
                            {series.map((s, i) => (
                                <Area
                                    key={s.key}
                                    type="monotone"
                                    dataKey={s.key}
                                    name={s.label}
                                    stroke={colorOf(s, i)}
                                    strokeWidth={2.5}
                                    fill={`url(#${id}-${s.key})`}
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 2, stroke: "#FFFFFF", fill: colorOf(s, i) }}
                                    isAnimationActive={false}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <DataTable caption={description} data={data} xKey={xKey} xLabel={xLabel} xFormat={xFormat} series={series} format={format} />
        </div>
    );
}

// Barres verticales (une ou plusieurs séries, côte à côte ou empilées). `highlightLast` met la dernière barre en marine.
export function BarCompare({ data, xKey, xLabel, series, format = defaultFormat, xFormat, height = 220, description, stacked = false, highlightLast = false, highlightIndex = null, className }) {
    // Barre mise en valeur (série unique) : la dernière, ou celle d'index `highlightIndex` (semaine courante).
    const hi = highlightLast ? data.length - 1 : highlightIndex;
    return (
        <div className={cn("grid gap-3", className)}>
            <Legend series={series} />
            <div role="img" aria-label={description} style={{ height }}>
                <div aria-hidden="true" className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
                            <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 4" />
                            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={AXIS} tickMargin={8} tickFormatter={xFormat} minTickGap={16} />
                            <YAxis tickLine={false} axisLine={false} tick={AXIS} tickFormatter={format} width={36} allowDecimals={false} />
                            <Tooltip cursor={{ fill: "#F3E7C8", opacity: 0.6 }} content={<ChartTooltip series={series} format={format} labelFormat={xFormat} />} />
                            {series.map((s, i) => (
                                <Bar
                                    key={s.key}
                                    dataKey={s.key}
                                    name={s.label}
                                    stackId={stacked ? "a" : undefined}
                                    fill={colorOf(s, i)}
                                    maxBarSize={24}
                                    radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
                                    isAnimationActive={false}
                                >
                                    {hi != null && series.length === 1
                                        ? data.map((_, j) => <Cell key={j} fill={j === hi ? SLOTS[0] : colorOf(s, i)} />)
                                        : null}
                                </Bar>
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <DataTable caption={description} data={data} xKey={xKey} xLabel={xLabel} xFormat={xFormat} series={series} format={format} />
        </div>
    );
}

// Anneau de répartition + légende chiffrée. data = [{ label, value, slot? }].
export function DonutBreakdown({ data, format = defaultFormat, centerLabel, description, size = 168, className }) {
    const total = data.reduce((n, d) => n + d.value, 0);
    const series = data.map((d, i) => ({ key: d.label, label: d.label, slot: d.slot ?? (i % SLOTS.length) + 1 }));
    return (
        <div className={cn("flex flex-wrap items-center gap-6", className)}>
            <div role="img" aria-label={description} className="relative shrink-0" style={{ width: size, height: size }}>
                <div aria-hidden="true" className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                dataKey="value"
                                nameKey="label"
                                innerRadius={Math.round(size * 0.33)}
                                outerRadius={Math.round(size / 2)}
                                stroke="#FFFFFF"
                                strokeWidth={2}
                                startAngle={90}
                                endAngle={-270}
                                rootTabIndex={-1}
                                isAnimationActive={false}
                            >
                                {data.map((d, i) => (
                                    <Cell key={d.label} fill={colorOf(series[i], i)} />
                                ))}
                            </Pie>
                            <Tooltip content={<ChartTooltip series={[]} format={format} />} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
                    <span className="font-serif text-2xl font-bold tabular-nums text-brand-night">{format(total)}</span>
                    {centerLabel && <span className="text-xs text-brand-warmgray">{centerLabel}</span>}
                </div>
            </div>
            <ul className="grid min-w-[180px] max-w-[340px] flex-1 gap-2">
                {data.map((d, i) => (
                    <li key={d.label} className="flex items-center justify-between gap-4 text-sm">
                        <span className="flex min-w-0 items-center gap-2 text-brand-anthracite">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: colorOf(series[i], i) }} />
                            <span className="truncate">{d.label}</span>
                        </span>
                        <span className="shrink-0 whitespace-nowrap tabular-nums">
                            <span className="font-bold text-brand-night">{format(d.value)}</span>
                            <span className="ml-2 text-xs text-brand-warmgray">{total ? Math.round((d.value / total) * 100) : 0} %</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// Barres horizontales simples (étapes d'un pipeline, canaux d'acquisition) : [{ label, value, slot? }], largeur relative au maximum.
export function HorizontalBars({ data, format = defaultFormat, description, className, testIdPrefix }) {
    const max = Math.max(1, ...data.map((d) => d.value));
    return (
        <ul className={cn("flex flex-col gap-3.5", className)} aria-label={description}>
            {data.map((d) => (
                <li key={d.label} data-testid={testIdPrefix ? `${testIdPrefix}${d.label}` : undefined} className="flex flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-brand-anthracite">{d.label}</span>
                        <span className="font-bold tabular-nums text-brand-night">{format(d.value)}</span>
                    </span>
                    <span className="block h-2.5 w-full overflow-hidden rounded-full bg-brand-champagne" aria-hidden="true">
                        <span className="block h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: SLOTS[(d.slot ?? 2) - 1] }} />
                    </span>
                </li>
            ))}
        </ul>
    );
}

// Mini-courbe décorative (la valeur et la tendance sont écrites à côté).
export function Sparkline({ data, slot = 2, height = 36, width = 110 }) {
    const rows = data.map((v, i) => ({ i, v }));
    return (
        <span aria-hidden="true" className="block shrink-0" style={{ width, height }}>
            <LineChart width={width} height={height} data={rows} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <Line type="monotone" dataKey="v" stroke={SLOTS[slot - 1]} strokeWidth={2.5} dot={false} isAnimationActive={false} strokeLinecap="round" />
            </LineChart>
        </span>
    );
}

// Carte de chiffre clé : libellé (bouton vers l'onglet, toute la carte cliquable), valeur, variation, mini-courbe.
// delta = variation relative (0,18 = +18 %) ; deltaText remplace le pourcentage (« +3 », « 2 en retard ») ;
// good = "up" quand une hausse est une bonne nouvelle ; alert = mise en avant (or foncé).
export function KpiCard({ label, value, delta, deltaText, good = "up", hint, trend, trendSlot = 2, alert = false, onClick, testId, t }) {
    const hasDelta = typeof delta === "number" && Number.isFinite(delta);
    const flat = hasDelta && Math.round(delta * 100) === 0;
    const up = hasDelta ? delta >= 0 : null;
    const positive = hasDelta && !flat ? (up && good === "up") || (!up && good === "down") : null;
    const pct = hasDelta ? (flat ? t("stable") : `${up ? "+" : "−"}${Math.round(Math.abs(delta) * 100)} %`) : null;
    return (
        <div
            data-testid={testId}
            className={cn(
                "relative flex min-w-0 flex-col gap-3 rounded-2xl border border-brand-beige bg-white p-5 shadow-subtle transition-colors sm:p-6",
                onClick && "focus-within:ring-2 focus-within:ring-brand-gold hover:border-brand-gold/60",
            )}
        >
            <div className="flex items-center justify-between gap-3">
                {onClick ? (
                    <button
                        type="button"
                        onClick={onClick}
                        className="text-left text-sm font-semibold text-brand-warmgray outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
                    >
                        {label}
                    </button>
                ) : (
                    <span className="text-sm font-semibold text-brand-warmgray">{label}</span>
                )}
                {(pct || deltaText) && (
                    <span
                        className={cn(
                            "inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                            alert || positive === false ? "bg-brand-darkgold text-white" : "bg-brand-champagne text-brand-night",
                        )}
                    >
                        {hasDelta && !flat && (up ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />)}
                        {hasDelta && !flat && <span className="sr-only">{up ? t("en hausse de") : t("en baisse de")} </span>}
                        {deltaText || pct}
                    </span>
                )}
            </div>
            <div className="flex items-end justify-between gap-3">
                <span className="font-serif text-3xl font-bold leading-none tabular-nums text-brand-night">{value}</span>
                {trend && trend.length > 1 && <Sparkline data={trend} slot={trendSlot} />}
            </div>
            {hint && <p className={cn("text-xs", alert ? "font-bold text-brand-darkgold" : "text-brand-warmgray")}>{hint}</p>}
        </div>
    );
}
