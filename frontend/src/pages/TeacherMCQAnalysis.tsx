import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, BarChart3, RefreshCw, Info, ChevronDown } from 'lucide-react';
import ContentBlockView from '../components/mcq/ContentBlockView';
import type { StoredContent } from '../components/mcq/blocks';
import { getToken } from '../utils/sessionToken';

type Decision = 'retain' | 'revise' | 'discard' | 'insufficient';
interface Choice { choice_id: number; choice_text: string; image_url?: string; content_blocks?: StoredContent; is_correct: boolean; label: string; count: number; percentage: number }
interface Item {
  question_id: number; question_type: string; question_text: string; image_url?: string; content_blocks?: StoredContent;
  number: number; n: number; correct: number; incorrect: number; unanswered: number; answered: number; unknown_choices: number;
  difficulty: number | null; difficulty_label: string; discrimination: number | null; discrimination_reason: string | null;
  partial_credit: boolean; recommendation: Decision; recommendation_reason: string; choices: Choice[];
}
interface Report {
  mission_title: string; n: number; question_count: number; roster_count: number; pending_count: number; not_started_count: number;
  excluded_before_questions: number; min_recommendation_n: number; items: Item[]; recommendations: Partial<Record<Decision, number>>;
  classes: {class_id: number; class_name: string; grade_level: string}[];
}
const decisions: Record<Decision, {label: string; style: string}> = {
  retain: {label:'ใช้ต่อ', style:'bg-emerald-50 text-emerald-700 border-emerald-200'},
  revise: {label:'ปรับปรุง', style:'bg-amber-50 text-amber-800 border-amber-200'},
  discard: {label:'ควรพิจารณาตัดออก', style:'bg-rose-50 text-rose-700 border-rose-200'},
  insufficient: {label:'ข้อมูลยังไม่พอ', style:'bg-slate-100 text-slate-600 border-slate-200'},
};
const types: Record<string,string> = {multiple_choice:'เลือกตอบ',true_false:'ถูก / ผิด',fill_blank:'เติมคำ',matching:'จับคู่',categorize:'จัดหมวดหมู่',sudoku:'ซูโดกุ',flowchart:'ผังงาน'};
const number = (value: number | null) => value === null ? '—' : value.toFixed(2);

export default function TeacherMCQAnalysis() {
  const {id} = useParams();
  const [params, setParams] = useSearchParams();
  const classId = params.get('class_id') || '';
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [decisionFilter, setDecisionFilter] = useState('');
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    axios.get<Report>(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${id}/item-analysis`, {
      params: classId ? {class_id:classId} : {}, headers:{Authorization:`Bearer ${getToken()}`}, signal:controller.signal,
    }).then(response => {
      setData(response.data);
      setSelectedItem(null);
    }).catch(err => {
      if (axios.isCancel(err)) return;
      setError(err.response?.status === 403 ? 'เฉพาะครูเจ้าของรายวิชาเท่านั้นที่ดูการวิเคราะห์นี้ได้' : 'โหลดการวิเคราะห์ไม่สำเร็จ กรุณาลองใหม่');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, classId, refresh]);
  const items = data?.items.filter(item => !decisionFilter || item.recommendation === decisionFilter) || [];

  return <div className="h-screen overflow-y-auto bg-slate-50 text-slate-800">
    <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to={`/teacher/mission/${id}/progress`} aria-label="กลับหน้าติดตามผล" className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20}/></Link>
          <div><h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><BarChart3 className="text-violet-600"/>วิเคราะห์ข้อสอบรายข้อ</h1><p className="text-sm text-slate-500 mt-1">{data?.mission_title || 'แบบทดสอบ MCQ'}</p></div>
        </div>
        <button onClick={() => setRefresh(v => v + 1)} disabled={loading} className="flex items-center gap-2 border border-slate-200 rounded-xl bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>อัปเดตข้อมูล</button>
      </div>
    </header>
    <main className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
      <div className="flex flex-wrap gap-4 items-end">
        <label className="text-sm font-semibold">ห้องเรียน<select aria-label="ห้องเรียน" value={classId} onChange={e => {setParams(e.target.value ? {class_id:e.target.value} : {});setDecisionFilter('');}} className="block mt-2 bg-white border border-slate-200 rounded-xl px-3 py-2 min-w-48">
          <option value="">ทุกห้องในรายวิชา</option>{data?.classes.map(c => <option key={c.class_id} value={c.class_id}>{c.grade_level} · {c.class_name}</option>)}
        </select></label>
        <p className="text-sm text-slate-500 pb-2">ใช้คำตอบรอบล่าสุดที่เก็บอยู่ของนักเรียนที่จบแบบทดสอบแล้ว ไม่รวมครูทดลองเล่น</p>
      </div>
      {error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</div> : loading ? <div role="status" className="rounded-2xl bg-white p-16 text-center text-slate-500">กำลังคำนวณการวิเคราะห์ข้อสอบ…</div> : data && <>
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3" aria-label="ภาพรวม">
          <div className="rounded-2xl p-5 border border-violet-200 bg-violet-50"><p className="text-sm text-violet-700">ผู้สอบที่นำมาวิเคราะห์</p><p className="text-3xl font-bold text-violet-800 mt-2">{data.n} <span className="text-sm font-normal">คน</span></p></div>
          {(Object.keys(decisions) as Decision[]).map(key => <button key={key} onClick={() => {setDecisionFilter(decisionFilter === key ? '' : key);setSelectedItem(null);}} aria-pressed={decisionFilter === key} className={`text-left rounded-2xl p-5 border ${decisions[key].style} ${decisionFilter === key ? 'ring-2 ring-violet-500' : ''}`}><p className="text-sm">{decisions[key].label}</p><p className="text-3xl font-bold mt-2">{data.recommendations[key] || 0} <span className="text-sm font-normal">ข้อ</span></p></button>)}
        </section>
        <p className="text-sm text-slate-500">นักเรียนในกลุ่ม {data.roster_count} คน · กำลังทำ {data.pending_count} คน · ยังไม่เริ่ม {data.not_started_count} คน{data.excluded_before_questions > 0 && ` · ไม่นับ ${data.excluded_before_questions} คนที่สอบจบก่อนมีข้อสอบปัจจุบันครบ`}</p>
        {data.n < data.min_recommendation_n && <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Info className="shrink-0" size={20}/><p>{data.n === 0 ? 'ยังไม่มีคำตอบที่จบแบบทดสอบสำหรับกลุ่มนี้' : `มีผู้สอบ ${data.n} คน ค่าสถิติยังผันผวนได้มาก`} ระบบจะแสดงคำแนะนำคัดกรองเมื่อมีอย่างน้อย {data.min_recommendation_n} คน เกณฑ์นี้เป็นข้อกำหนดของระบบ ไม่ใช่การรับรองความแม่นยำ</p></div>}
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-5 flex flex-wrap justify-between items-center gap-3"><div><h2 className="font-bold text-lg">ภาพรวมรายข้อ</h2><p className="text-sm text-slate-500 mt-1">กดเลขข้อเพื่อดูจำนวนคนเลือก A, B, C, D และรูปตัวเลือก</p></div><label className="text-sm">แสดง <select aria-label="กรองคำแนะนำ" value={decisionFilter} onChange={e => {setDecisionFilter(e.target.value);setSelectedItem(null);}} className="border border-slate-200 rounded-lg p-2 ml-2"><option value="">ทุกข้อ</option>{(Object.keys(decisions) as Decision[]).map(key => <option key={key} value={key}>{decisions[key].label}</option>)}</select></label></div>
          <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 border-y border-slate-200 text-slate-500"><tr>{['ข้อ','ถูก / ผิด','เว้นว่าง','ความยาก p','อำนาจจำแนก r','คำแนะนำ'].map(label => <th key={label} className="px-5 py-3 whitespace-nowrap font-semibold">{label}</th>)}</tr></thead><tbody>
            {items.map(item => <tr key={item.question_id} className={`border-b border-slate-100 ${selectedItem === item.question_id ? 'bg-violet-50' : 'hover:bg-slate-50'}`}><td className="px-5 py-4"><button onClick={() => setSelectedItem(item.question_id === selectedItem ? null : item.question_id)} aria-expanded={selectedItem === item.question_id} className="font-bold text-violet-700 flex items-center gap-2 whitespace-nowrap">ข้อ {item.number}<ChevronDown size={15}/></button><p className="text-xs text-slate-400 mt-1">{types[item.question_type] || item.question_type}</p></td><td className="px-5 py-4 whitespace-nowrap"><span className="text-emerald-700 font-bold">{item.correct}</span> / <span className="text-rose-600">{item.incorrect}</span> คน</td><td className="px-5 py-4">{item.unanswered}</td><td className="px-5 py-4"><strong>{number(item.difficulty)}</strong><p className="text-xs text-slate-500 mt-1">{item.difficulty_label}</p></td><td className={`px-5 py-4 font-bold ${(item.discrimination ?? 0) < 0 ? 'text-rose-600' : ''}`}>{number(item.discrimination)}</td><td className="px-5 py-4"><span className={`inline-block px-3 py-1 rounded-full border whitespace-nowrap text-xs font-semibold ${decisions[item.recommendation].style}`}>{decisions[item.recommendation].label}</span></td></tr>)}
          </tbody></table></div>
          {items.length === 0 && <p className="p-10 text-center text-slate-500">{data.question_count === 0 ? 'ยังไม่มีข้อสอบที่พร้อมให้นักเรียนทำ' : 'ไม่มีข้อสอบในกลุ่มคำแนะนำนี้'}</p>}
        </section>
        {items.filter(item => selectedItem === null || selectedItem === item.question_id).map(item => <article key={item.question_id} className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-lg">ข้อ {item.number} <span className="font-normal text-sm text-slate-400">{types[item.question_type]}</span></h2><span className={`px-3 py-1 rounded-full border text-xs font-semibold ${decisions[item.recommendation].style}`}>{decisions[item.recommendation].label}</span></div>
          <ContentBlockView size="question" content={item.content_blocks} text={item.question_text} imageUrl={item.image_url} textClassName="font-semibold text-slate-800"/>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><span>ตอบแล้ว <strong>{item.answered}</strong> คน</span><span className="text-emerald-700">ถูกทั้งข้อ <strong>{item.correct}</strong> คน</span><span className="text-rose-600">ไม่ถูกทั้งข้อ <strong>{item.incorrect}</strong> คน</span><span>เว้นว่าง <strong>{item.unanswered}</strong> คน</span></div>
          {item.choices.length > 0 ? <div className="grid sm:grid-cols-2 gap-3">{item.choices.map(choice => <div key={choice.choice_id} className={`rounded-xl border p-4 ${choice.is_correct ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200'}`}><div className="flex justify-between items-center gap-3 mb-3"><span className="font-bold">{choice.label} {choice.is_correct && <span className="text-emerald-700 text-xs font-normal">คำตอบที่ถูก</span>}</span><strong>{choice.count} คน <span className="text-slate-500 font-normal">({choice.percentage.toFixed(1)}%)</span></strong></div><ContentBlockView size="choice" content={choice.content_blocks} text={choice.choice_text} imageUrl={choice.image_url}/><div role="meter" aria-label={`จำนวนคนเลือก ${choice.label}`} aria-valuenow={choice.count} aria-valuemin={0} aria-valuemax={Math.max(item.n, 1)} className="h-2 mt-4 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${choice.is_correct ? 'bg-emerald-500' : 'bg-violet-400'}`} style={{width:`${choice.percentage}%`}}/></div>{data.n >= 20 && !choice.is_correct && choice.count === 0 && <p className="text-xs text-amber-700 mt-2">ไม่มีผู้เลือกตัวลวงนี้ ควรทบทวนความสมเหตุสมผล</p>}</div>)}</div> : <p className="text-sm text-slate-500">ข้อนี้ไม่มีตัวเลือก A–D จึงแสดงผลถูก–ผิดและคะแนนรายข้อ</p>}
          {item.unknown_choices > 0 && <p className="text-sm text-amber-700">มี {item.unknown_choices} คำตอบอ้างถึงตัวเลือกเดิมที่ไม่มีอยู่แล้ว ควรตรวจการเปลี่ยนแปลงข้อสอบ</p>}
          <div className="grid sm:grid-cols-2 gap-4 bg-slate-50 rounded-xl p-4 text-sm"><p>ความยากง่าย <strong>p = {number(item.difficulty)}</strong> · {item.difficulty_label}<span className="block text-slate-500 text-xs mt-1">{item.partial_credit ? 'คะแนนเฉลี่ยรายข้อ ÷ คะแนนเต็ม รวมคะแนนย่อย' : 'จำนวนตอบถูก ÷ ผู้สอบในกลุ่ม (รวมเว้นว่าง)'}</span></p><p>อำนาจจำแนก <strong>r = {number(item.discrimination)}</strong><span className="block text-slate-500 text-xs mt-1">{item.discrimination_reason || 'สหสัมพันธ์คะแนนข้อนี้กับผลรวมข้ออื่น โดยหักข้อนี้ออก'}</span></p></div>
          <p className="text-sm leading-relaxed"><strong>เหตุผล: </strong>{item.recommendation_reason}</p>
        </article>)}
        <details className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600"><summary className="font-semibold text-slate-800 cursor-pointer">วิธีคำนวณและเกณฑ์ที่ใช้</summary><div className="space-y-3 pt-4 leading-relaxed">
          <p>แต่ละข้อมีคะแนนวิเคราะห์ 0–1 ข้อทั่วไปใช้ถูก = 1 ไม่ถูก = 0 ส่วนซูโดกุและผังงานใช้สัดส่วนคะแนนย่อยที่บันทึก คะแนนรวมสำหรับหา r คือผลรวมคะแนนวิเคราะห์ข้ออื่น ไม่รวมข้อนั้นและไม่ใช้ XP โบนัสผ่านด่าน</p>
          <p>r เป็น corrected item–total correlation (เทียบเท่า point-biserial สำหรับข้อถูก/ผิด) ช่วง −1 ถึง 1 หากมีข้อเดียวหรือคะแนนไม่กระจายจะแสดง “—” ค่า p ยิ่งสูงหมายถึงข้อยิ่งง่าย</p>
          <p>เกณฑ์คัดกรองของหน้านี้: ใช้ต่อเมื่อ p อยู่ในช่วง 0.20–0.80 และ r ≥ 0.30; ปรับปรุงเมื่อ 0.10 ≤ r &lt; 0.30 หรือข้อยาก/ง่ายมาก; พิจารณาตัดออกเมื่อ r &lt; 0.10 โดยต้องตรวจเฉลยและเนื้อหาก่อน ไม่ได้ลบข้อสอบอัตโนมัติ ใช้ค่าก่อนปัดเศษในการตัดสิน</p>
          <p>ไม่นำข้อร่างและครูทดลองเล่นมาคำนวณ นักเรียนหนึ่งคนนับครั้งเดียวตามคำตอบรอบล่าสุดที่ยังเก็บอยู่ A–D อ้างอิงลำดับตัวเลือกที่บันทึก ไม่ใช่ตำแหน่งที่นักเรียนเห็นหลังสุ่ม ข้อมูลคำตอบอ้างอิงข้อสอบปัจจุบัน ไม่มีภาพย้อนหลังของข้อสอบแต่ละรุ่น หากแก้ข้อหรือเฉลยหลังสอบควรทดลองและเก็บข้อมูลใหม่</p>
          <p>ควรตีความร่วมกับจุดประสงค์การวัดและเนื้อหา ข้อง่ายอาจจำเป็นสำหรับวัดพื้นฐาน เกณฑ์จำนวน 20 คนเป็นเพียงขั้นต่ำของระบบ แม้เกินแล้วก็ยังต้องพิจารณาขนาดและลักษณะกลุ่มผู้สอบ</p>
          <a href="https://www.washington.edu/assessment/scanning-scoring/scoring/reports/item-analysis/" target="_blank" rel="noreferrer" className="text-violet-700 underline">แนวคิดสถิติ: University of Washington — Understanding Item Analyses</a>
        </div></details>
      </>}
    </main>
  </div>;
}
