import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveCustomerCommunicationProfileV1 as customer } from './customer-communication-profile.ts'
import { deriveSellerVoiceProfileV1 as seller } from './seller-voice-profile.ts'
import { deriveCommunicationAdaptationV1 as adapt } from './communication-adaptation.ts'

const NOW = '2026-08-31T15:00:00.000Z'
const cid = id => ({source_type:'conversation_message',source_id:String(id),source_version:'1',observed_at:NOW,evidence_message_ids:[String(id)]})
const msg = (id,direction,text,{ago=0,type='text'}={}) => ({
  message_id:String(id),message_key:`k-${id}`,version:1,sequence:Number(id),direction,
  occurred_at:new Date(Date.parse(NOW)-ago*60000).toISOString(),observed_at:NOW,
  content_type:type,text_content:type==='text'?text:null,audio_transcription:type==='audio'?text:null,
  canonical_state:'active',provenance:[cid(id)],
})
const mem = (id,value,evidence=[],kind='client.communication.pattern') => ({
  memory_id:id,collection:'facts',kind,summary:'Observação comportamental canônica.',value,confidence:'medium',memory_status:'active',
  created_in_state_version:1,updated_in_state_version:1,closed_in_state_version:null,evidence_message_ids:evidence,attributes:{},
  provenance:[{source_type:'state_memory',source_id:id,source_version:'1',observed_at:NOW,evidence_memory_ids:[id],evidence_message_ids:evidence}],
})
const baseSeller = () => [
  msg(101,'outgoing','Boa tarde. Por favor, confira os dados abaixo. Fico à disposição.',{ago:30}),
  msg(102,'outgoing','Boa tarde. Agradeço pelo retorno. Fico à disposição.',{ago:20}),
  msg(103,'outgoing','Boa tarde. Poderia confirmar o horário? Fico à disposição.',{ago:10}),
]
const snap = ({incoming=[],outgoing=[],current=[],excluded=[],durable=[],intent='Responder mantendo a intenção comercial já decidida.'}={}) => {
  const messages=[...incoming,...outgoing].sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||a.sequence-b.sequence)
  const cur=messages.filter(m=>current.includes(m.message_id))
  return {
    contract_version:'message-context-snapshot-v1',request_id:'r1',reference_time:NOW,
    identity:{company_id:'11111111-1111-4111-8111-111111111111',seller_user_id:'22222222-2222-4222-8222-222222222222',cycle_id:'33333333-3333-4333-8333-333333333333',conversation_key:'c1',provenance:[]},
    seller_intent:{value:intent,provenance:[]},
    conversation:{messages,excluded_messages:excluded.map(id=>({message_id:String(id),message_key:`k-${id}`,version:2,reason:'deleted',deletion_reason:'explicit_deletion',canonical_state:'deleted',provenance:[cid(id)]})),current_interaction:cur.length?{messages:cur.map(m=>({message_id:m.message_id,direction:m.direction,occurred_at:m.occurred_at,content_type:m.content_type,text_content:m.text_content,audio_transcription:m.audio_transcription,provenance:m.provenance})),started_at:cur[0].occurred_at,ended_at:cur.at(-1).occurred_at,provenance:cur.flatMap(m=>m.provenance)}:null},
    customer:{communication_observations:durable},commercial:{},company:{},
  }
}
const sig=(p,k)=>p.signals.find(x=>x.signal===k)??null
const long = seed => Array.from({length:60},(_,i)=>`${seed}${i}`).join(' ')
const shortIn = () => [msg(1,'incoming','Sim.',{ago:25}),msg(2,'incoming','Qual valor?',{ago:15}),msg(3,'incoming','Pode enviar.',{ago:5})]

// 1–5: customer evidence and exclusions
test('1 short responses observáveis',()=>assert.equal(sig(customer(snap({incoming:shortIn()})),'short_responses')?.observation_count,3))
test('2 direct questions observáveis',()=>assert.ok(sig(customer(snap({incoming:[msg(1,'incoming','Qual valor?',{ago:25}),msg(2,'incoming','Tem contrato?',{ago:15}),msg(3,'incoming','Quando começa?',{ago:5})]})),'direct_questions')))
test('3 long messages diferem de short',()=>{const p=customer(snap({incoming:[msg(1,'incoming',long('a'),{ago:25}),msg(2,'incoming',long('b'),{ago:15}),msg(3,'incoming',long('c'),{ago:5})]}));assert.ok(sig(p,'long_messages'));assert.equal(sig(p,'short_responses'),null)})
test('4 uma mensagem não cria perfil forte',()=>{const p=customer(snap({incoming:[msg(1,'incoming','Sim.',{ago:1})]}));assert.equal(p.status,'partial');assert.equal(p.signals.length,0)})
test('5 deletada não sustenta perfil',()=>{const d=msg(9,'incoming','Sim.',{ago:1});const p=customer(snap({incoming:[d,msg(1,'incoming',long('x'),{ago:20}),msg(2,'incoming',long('y'),{ago:10})],excluded:['9']}));assert.equal(sig(p,'short_responses'),null);assert.ok(sig(p,'long_messages'))})

// 6–10: separation, psych guard, provenance, confidence, temporal weighting
test('6 seller/customer separados por direção',()=>{const s=snap({incoming:shortIn(),outgoing:[msg(101,'outgoing',long('seller'),{ago:1}),msg(102,'outgoing',long('seller'),{ago:2}),msg(103,'outgoing',long('seller'),{ago:3})]});const cp=customer(s),sp=seller(s);assert.ok(cp.signals.every(x=>x.evidence_message_ids.every(id=>Number(id)<100)));assert.ok(sp.typical_length.evidence_message_ids.every(id=>Number(id)>=100))})
test('7 perfil não contém atributos psicológicos',()=>{const p=customer(snap({durable:[{...mem('m1','short_responses'),summary:'cliente é impaciente e ansioso'}]}));const raw=JSON.stringify(p).toLowerCase();assert.equal(raw.includes('impaciente'),false);assert.equal(raw.includes('ansioso'),false)})
test('8 evidence IDs preservados',()=>{const p=customer(snap({incoming:shortIn()}));assert.deepEqual(sig(p,'short_responses').evidence_message_ids,['1','2','3'])})
test('9 confidence depende da evidência',()=>{const two=customer(snap({incoming:[msg(1,'incoming','Sim.',{ago:2}),msg(2,'incoming','Ok.',{ago:1})]}));const seven=customer(snap({incoming:Array.from({length:7},(_,i)=>msg(i+1,'incoming','Ok.',{ago:7-i}))}));assert.equal(sig(two,'short_responses').confidence,'low');assert.equal(sig(seven,'short_responses').confidence,'high')})
test('10 current pesa mais sem apagar durable/recent',()=>{const incoming=[msg(1,'incoming',long('old'),{ago:100}),msg(2,'incoming',long('old'),{ago:90}),msg(3,'incoming','Sim.',{ago:2}),msg(4,'incoming','Qual valor?',{ago:1})];const p=customer(snap({incoming,current:['3','4']}));assert.ok(sig(p,'long_messages'));assert.ok(sig(p,'short_responses'));assert.ok(sig(p,'short_responses').weighted_observation_score>sig(p,'short_responses').observation_count)})

// 11–15: seller voice and adaptation
test('11 greeting recorrente preservado',()=>assert.equal(seller(snap({outgoing:baseSeller()})).greeting_pattern?.value,'boa tarde'))
test('12 closing recorrente preservado',()=>assert.equal(seller(snap({outgoing:baseSeller()})).closing_pattern?.value,'fico à disposição'))
test('13 emoji é observado, não imposto',()=>{const s=snap({outgoing:[msg(101,'outgoing','Oi 🙂',{ago:3}),msg(102,'outgoing','Certo 🙂',{ago:2}),msg(103,'outgoing','Perfeito 🙂',{ago:1})]});const sp=seller(s),a=adapt({customer_profile:customer(s),seller_voice:sp});assert.equal(sp.emoji_usage.value,'frequent');assert.equal(a.reduce_emoji,false)})
test('14 cliente curto adapta sem destruir voz seller',()=>{const s=snap({incoming:shortIn(),outgoing:baseSeller()});const a=adapt({customer_profile:customer(s),seller_voice:seller(s)});assert.equal(a.prefer_shorter,true);assert.equal(a.maintain_seller_greeting,true);assert.equal(a.preserve_seller_closing,true)})
test('15 formalidade do seller não copia cliente',()=>{const s=snap({incoming:[msg(1,'incoming','blz',{ago:3}),msg(2,'incoming','manda aí',{ago:2}),msg(3,'incoming','sim',{ago:1})],outgoing:baseSeller()});const a=adapt({customer_profile:customer(s),seller_voice:seller(s)});assert.equal(a.maintain_formality,'formal')})

// 16–20: hard boundaries, determinism, insufficient evidence
test('16 nenhum commercial move',()=>{const a=adapt({customer_profile:customer(snap()),seller_voice:seller(snap())});for(const k of ['decision','strategy','next_action','commercial_move'])assert.equal(Object.hasOwn(a,k),false)})
test('17 nenhuma técnica/método',()=>{const a=adapt({customer_profile:customer(snap()),seller_voice:seller(snap())});assert.equal(Object.hasOwn(a,'technique'),false);assert.equal(Object.hasOwn(a,'method'),false)})
test('18 nenhuma mensagem customer-facing',()=>{const a=adapt({customer_profile:customer(snap()),seller_voice:seller(snap())});assert.equal(Object.hasOwn(a,'message'),false);assert.equal(Object.hasOwn(a,'recommended_message'),false)})
test('19 determinismo',()=>{const s=snap({incoming:shortIn(),outgoing:baseSeller(),durable:[mem('m1','short_responses',['1','2'])]});const run=()=>{const cp=customer(s),sp=seller(s);return {cp,sp,a:adapt({customer_profile:cp,seller_voice:sp})}};assert.deepEqual(run(),run())})
test('20 contexto insuficiente é parcial/ausente, nunca invenção',()=>{const s=snap({incoming:[msg(1,'incoming','Ok.',{ago:1})],outgoing:[msg(101,'outgoing','Certo.',{ago:1})]});const cp=customer(s),sp=seller(s),a=adapt({customer_profile:cp,seller_voice:sp});assert.equal(cp.status,'partial');assert.equal(sp.status,'partial');assert.deepEqual(cp.signals,[]);assert.equal(a.status,'absent')})

// 21: cenário crítico — mesma intenção/mesmo seller; linguagem muda, estratégia não existe aqui.
test('21 mesmo seller/intenção, clientes A curto e B longo => adaptation diferente sem strategy',()=>{
  const out=baseSeller(), intent='Responder mantendo a intenção comercial de alto nível já decidida.'
  const aSnap=snap({outgoing:out,intent,incoming:shortIn()})
  const bSnap=snap({outgoing:out,intent,incoming:[msg(11,'incoming',long('A'),{ago:25}),msg(12,'incoming',long('B'),{ago:15}),msg(13,'incoming',long('C'),{ago:5})]})
  const sa=seller(aSnap), sb=seller(bSnap); assert.deepEqual(sa,sb); assert.equal(aSnap.seller_intent.value,bSnap.seller_intent.value)
  const aa=adapt({customer_profile:customer(aSnap),seller_voice:sa}), ab=adapt({customer_profile:customer(bSnap),seller_voice:sb})
  assert.equal(aa.prefer_shorter,true); assert.equal(ab.prefer_shorter,false); assert.notDeepEqual(aa,ab); assert.equal(Object.hasOwn(aa,'strategy'),false); assert.equal(Object.hasOwn(ab,'strategy'),false)
})
