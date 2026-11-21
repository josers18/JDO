import{k as c}from"./index-CkUKfEgh.js";const d=["var(--m-accent)","var(--next-move)","var(--series-third)","#539497","#c99962","#6c7486"];function v(e){return e<15?0:e<30?1:e<50?2:3}const m=/^005[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/,g=["Qualification","Proposal/Quote","Prospecting"];function h(e){const r=o=>{const a=g.indexOf(o);return a===-1?g.length:a};return[...e].sort((o,a)=>r(o.name)-r(a.name))}async function y(e){if(!m.test(e))throw new Error("A verified pipeline owner is required.");const r=`where: { OwnerId: { eq: "${e}" }, IsClosed: { eq: false } }`,a=(await c(`query AtlasPipeline {
    uiapi { aggregate {
      Opportunity(${r}) { edges { node { aggregate { Amount { sum { value } } } } } }
      Stages: Opportunity(${r}, groupBy: { StageName: { group: true } }) {
        edges { node { aggregate { StageName { value } Amount { sum { value } } Id { count { value } } } } }
      }
    } }
  }`)).uiapi?.aggregate;return{amount:a?.Opportunity?.edges?.[0]?.node.aggregate?.Amount?.sum?.value??null,stages:(a?.Stages?.edges??[]).flatMap(({node:n})=>{const t=n.aggregate,i=t?.StageName?.value;return i?[{name:i,amount:t.Amount?.sum?.value??0,count:t.Id?.count?.value??null}]:[]}).sort((n,t)=>t.amount-n.amount)}}async function A(e,r,o,a,n=40,t){if(!m.test(e))throw new Error("A verified pipeline owner is required.");if(t&&!/^006[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(t))throw new Error("An exact opportunity ID is required.");const i=Math.min(100,Math.max(1,Math.trunc(n))),s=[],u=["IsClosed: { eq: false }",`OwnerId: { eq: "${e}" }`],l={after:a};t&&u.push(`Id: { eq: "${t}" }`),o&&(s.push("$stage: Picklist"),u.push("StageName: { eq: $stage }"),l.stage=o),r&&(s.push("$term: String"),u.push("or: [{ Name: { like: $term } }, { Account: { Name: { like: $term } } }]"),l.term="%"+r.replace(/[\\%_]/g,"\\$&")+"%");const p=await c(`
    query AtlasPipelineDeals(${["$after: String",...s].join(", ")}) {
      uiapi { query {
        Opportunity(first: ${i}, after: $after, where: { ${u.join(", ")} },
          orderBy: { Amount: { order: DESC }, Id: { order: ASC } }) {
          totalCount
          pageInfo { endCursor hasNextPage }
          edges { node {
            Id Name @optional { value } AccountId @optional { value }
            Account @optional { Name @optional { value } }
            StageName @optional { value } CloseDate @optional { value }
            Amount @optional { value } Probability @optional { value }
            LeadSource @optional { value } Description @optional { value }
          } }
        }
      } }
    }
  `,l);if(!p.uiapi?.query?.Opportunity)throw new Error("The opportunity worklist is unavailable.");return p.uiapi.query.Opportunity}export{A as a,d as b,v as c,y as f,h as o};
