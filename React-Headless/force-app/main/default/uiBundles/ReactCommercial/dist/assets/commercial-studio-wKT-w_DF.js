import{i as c}from"./index-Bo0rlY1f.js";const m=/^005[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/,g=["Qualification","Proposal/Quote","Prospecting"],d=["#6658b3","#3b8a83","#ae7898","#8d82c3","#6689ac"];function v(o){const a=r=>{const t=g.indexOf(r);return t===-1?g.length:t};return[...o].sort((r,t)=>a(r.name)-a(t.name))}async function h(o){if(!m.test(o))throw new Error("A verified pipeline owner is required.");const a=`where: { OwnerId: { eq: "${o}" }, IsClosed: { eq: false } }`,t=(await c(`query AtlasPipeline {
    uiapi { aggregate {
      Opportunity(${a}) { edges { node { aggregate { Amount { sum { value } } } } } }
      Stages: Opportunity(${a}, groupBy: { StageName: { group: true } }) {
        edges { node { aggregate { StageName { value } Amount { sum { value } } Id { count { value } } } } }
      }
    } }
  }`)).uiapi?.aggregate;return{amount:t?.Opportunity?.edges?.[0]?.node.aggregate?.Amount?.sum?.value??null,stages:(t?.Stages?.edges??[]).flatMap(({node:n})=>{const e=n.aggregate,i=e?.StageName?.value;return i?[{name:i,amount:e.Amount?.sum?.value??0,count:e.Id?.count?.value??null}]:[]}).sort((n,e)=>e.amount-n.amount)}}async function A(o,a,r,t,n=40,e){if(!m.test(o))throw new Error("A verified pipeline owner is required.");if(e&&!/^006[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(e))throw new Error("An exact opportunity ID is required.");const i=Math.min(100,Math.max(1,Math.trunc(n))),s=[],u=["IsClosed: { eq: false }",`OwnerId: { eq: "${o}" }`],l={after:t};e&&u.push(`Id: { eq: "${e}" }`),r&&(s.push("$stage: Picklist"),u.push("StageName: { eq: $stage }"),l.stage=r),a&&(s.push("$term: String"),u.push("or: [{ Name: { like: $term } }, { Account: { Name: { like: $term } } }]"),l.term="%"+a.replace(/[\\%_]/g,"\\$&")+"%");const p=await c(`
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
  `,l);if(!p.uiapi?.query?.Opportunity)throw new Error("The opportunity worklist is unavailable.");return p.uiapi.query.Opportunity}export{A as a,h as f,v as o,d as r};
