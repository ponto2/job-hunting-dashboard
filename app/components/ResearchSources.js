import { sanitizeResearchSources } from '@/lib/research-sources';

const fieldLabels = { name: '企業名', industry: '業界', headquarters: '本社', employees: '従業員数', founded: '設立', revenue: '売上高', business: '事業', products: '製品', salary_master_start: '初任給', salary_average: '平均年収', overtime_hours: '残業時間', paid_leave_rate: '有休消化率', turnover_rate: '離職率', benefits: '福利厚生', intern_period: '募集時期', intern_duration: '期間', intern_content: '内容', intern_selection: '選考', intern_url: '募集ページ', recruit_url: '採用ページ', official_url: '公式サイト' };

export default function ResearchSources({ sources }) {
  const list = sanitizeResearchSources(sources);
  if (!list.length) return null;
  return <details className="research-sources"><summary>出典・対象年度を確認</summary><ul>
    {list.map((source, index) => <li key={`${source.url}-${index}`}>
      <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}</a>
      <span> { [fieldLabels[source.field], source.year, source.scope].filter(Boolean).join(' · ') }</span>
    </li>)}
  </ul></details>;
}
