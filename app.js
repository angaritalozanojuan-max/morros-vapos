import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/*
  1) Create a Firebase project.
  2) Enable Authentication > Email/Password.
  3) Create Firestore Database.
  4) Replace the firebaseConfig below with your project's Web App config.
*/
const firebaseConfig = {
  apiKey: "AIzaSyA3UJW7gBytxeEAYpOECnK0F6PZWxC9p0U",
  authDomain: "morro-vapos.firebaseapp.com",
  projectId: "morro-vapos",
  storageBucket: "morro-vapos.firebasestorage.app",
  messagingSenderId: "752827827733",
  appId: "1:752827827733:web:0dcb0e971d2f198c1ab01c",
  measurementId: "G-J4FH08PZSY"
};

const firebaseReady = !Object.values(firebaseConfig).some(v => v === "REEMPLAZAR");
let auth, db;
if(firebaseReady){
  const fb = initializeApp(firebaseConfig);
  auth = getAuth(fb);
  db = getFirestore(fb);
}

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(n||0);
const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
};
const monthName = () => new Intl.DateTimeFormat("es-CO",{month:"long",year:"numeric"}).format(new Date());

let products = [];
let vitrinas = [
  {id:"cerveceria",name:"CERVECERIA"},
  {id:"graniloco",name:"GRANILOCO"},
  {id:"la26",name:"LA 26"},
  {id:"barber1ra",name:"BARBER 1RA"},
  {id:"nano-licores",name:"NANO LICORES"}
];
let sales = [];
let unsub = [];

const defaultProducts = [
 ["Airfuze",18000,18000,["airfuze"]],["Clase Azul",20000,50000,["clase azul","clase"]],
 ["Mijo Divi",40000,55000,["mijo divi","mijo"]],["Waka 10.000",38000,50000,["waka 10000","waka 10"]],
 ["Bugatti",13000,30000,["bugatti"]],["Mijo 3.000",35000,45000,["mijo 3000"]],
 ["Esencia Nimmbox",8000,18000,["esencia nimmbox","esencia"]],["Beyond",10000,25000,["beyond"]],
 ["Nimmbox",16000,40000,["nimmbox","nimbbox"]],["Nicky Jam",14000,25000,["nicky","nicky jam"]],
 ["Death Row",5000,15000,["death","desth","death row"]],["Cap NA",10000,30000,["cap na","capsula nacional"]],
 ["Cap Importada",20000,55000,["cap importada","capsula importada"]],["Kit THC",25000,40000,["kit thc"]],
 ["Waka 3.500",28000,45000,["waka","waka 3500","waka 3.500"]],["Batería",15000,30000,["bateria","batería"]],
 ["Lost Mary",8000,15000,["lost","lost mary"]],["Waka 2.000",20000,40000,["waka 2000","waka 2.000"]],
 ["Waka Smash",37000,50000,["waka smash"]],["Humo Azul",20000,50000,["humo","humo azul"]],
 ["AirPods Pro 2",38000,50000,["airpods","airpods pro 2"]],["Cargador Tipo C y Lightning",25000,35000,["cargador","tipo c","lightning"]]
].map((x,i)=>({id:"seed-"+i,name:x[0],cost:x[1],vitrinaPrice:x[2],aliases:x[3]}));

function normalize(s){
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[✅✔️]/g,"").replace(/\s+/g," ").trim();
}
function parseMoney(s){ if(!s) return null; const t=s.toLowerCase().replace(/\./g,"").replace(/\$/g,"").trim(); if(t.endsWith("k")) return Number(t.slice(0,-1).replace(",","."))*1000; const n=Number(t.replace(/[^0-9]/g,"")); return Number.isFinite(n)?n:null; }
function findProduct(text){
  const n=normalize(text);
  return products.find(p => [p.name,...(p.aliases||[])].some(a => n.includes(normalize(a))));
}
function parseLines(text, seller, vitrinaId=null){
  const out=[];
  for(const raw of text.split(/\r?\n/)){
    let line=normalize(raw);
    if(!line) continue;
    const qmatch=line.match(/^(\d+)\s+/);
    const qty=qmatch?Number(qmatch[1]):1;
    if(qmatch) line=line.slice(qmatch[0].length);
    const priceMatch=line.match(/(\$?\d[\d.,]*\s*k?)$/i);
    const pastedPrice=priceMatch?parseMoney(priceMatch[1]):null;
    if(priceMatch) line=line.slice(0,priceMatch.index).trim();
    const p=findProduct(line);
    if(!p) continue;
    const salePrice=vitrinaId ? (p.vitrinaPrice||0) : (pastedPrice||0);
    out.push({month:monthKey(),date:new Date().toISOString(),seller,source:vitrinaId?"vitrina":"seller",vitrinaId:vitrinaId||null,productId:p.id,productName:p.name,qty,salePrice,cost:p.cost,profit:(salePrice-p.cost)*qty});
  }
  return out;
}

function renderVitrinas(){
  $("vitrinaGrid").innerHTML=vitrinas.map(v=>`
    <div class="vitrina"><h3>${v.name}</h3>
      <textarea id="vit-${v.id}" placeholder="3 lost\n2 death\n1 nicky"></textarea>
      <button class="process" data-vitrina="${v.id}">Procesar ${v.name}</button>
    </div>`).join("");
  document.querySelectorAll("[data-vitrina]").forEach(b=>b.onclick=()=>processVitrina(b.dataset.vitrina));
}
function render(){
  $("monthLabel").textContent=monthName();
  const current=sales.filter(s=>s.month===monthKey());
  const totals=current.reduce((a,s)=>{a.sales+=s.salePrice*s.qty;a.cost+=s.cost*s.qty;a.profit+=s.profit;a.units+=s.qty;return a},{sales:0,cost:0,profit:0,units:0});
  $("totalSales").textContent=money(totals.sales);$("totalCost").textContent=money(totals.cost);$("totalProfit").textContent=money(totals.profit);$("totalUnits").textContent=totals.units;
  const juan=current.filter(s=>s.seller==="Juan").reduce((a,s)=>a+s.profit,0);
  const morro=current.filter(s=>s.seller==="Morro").reduce((a,s)=>a+s.profit,0);
  const vit=current.filter(s=>s.source==="vitrina").reduce((a,s)=>a+s.profit,0);
  $("summary").innerHTML=`<div>Ganancia total<strong>${money(totals.profit)}</strong></div><div>Juan recibe<strong>${money(totals.profit/2)}</strong></div><div>Morro recibe<strong>${money(totals.profit/2)}</strong></div><div>Ganancia generada por Juan<strong>${money(juan)}</strong></div><div>Ganancia generada por Morro<strong>${money(morro)}</strong></div><div>Ganancia de vitrinas<strong>${money(vit)}</strong></div>`;
  renderProducts();renderVitrinaTable();renderHistory();
}
function renderProducts(){
  $("productsTable").innerHTML=`<table><thead><tr><th>Producto</th><th>Costo</th><th>Precio vitrina</th><th>Alias</th><th></th></tr></thead><tbody>${
    products.map(p=>`<tr><td>${p.name}</td><td>${money(p.cost)}</td><td>${money(p.vitrinaPrice)}</td><td>${(p.aliases||[]).join(", ")}</td><td><button data-edit="${p.id}">Editar</button></td></tr>`).join("")
  }</tbody></table>`;
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editProduct(b.dataset.edit));
}
function renderVitrinaTable(){
  $("vitrinasTable").innerHTML=`<table><thead><tr><th>Vitrina</th><th></th></tr></thead><tbody>${
    vitrinas.map(v=>`<tr><td>${v.name}</td><td class="row-actions"><button data-rename-vit="${v.id}">Renombrar</button><button class="danger" data-delete-vit="${v.id}">Eliminar</button></td></tr>`).join("")
  }</tbody></table>`;
  document.querySelectorAll("[data-rename-vit]").forEach(b=>b.onclick=()=>renameVitrina(b.dataset.renameVit));
  document.querySelectorAll("[data-delete-vit]").forEach(b=>b.onclick=()=>deleteVitrina(b.dataset.deleteVit));
}
function renderHistory(){
  const by={};
  sales.forEach(s=>{by[s.month]??={sales:0,cost:0,profit:0,units:0};by[s.month].sales+=s.salePrice*s.qty;by[s.month].cost+=s.cost*s.qty;by[s.month].profit+=s.profit;by[s.month].units+=s.qty});
  $("historyTable").innerHTML=`<table><thead><tr><th>Mes</th><th>Ventas</th><th>Pedido</th><th>Ganancia</th><th>Unidades</th></tr></thead><tbody>${
    Object.entries(by).sort((a,b)=>b[0].localeCompare(a[0])).map(([m,x])=>`<tr><td>${m}</td><td>${money(x.sales)}</td><td>${money(x.cost)}</td><td>${money(x.profit)}</td><td>${x.units}</td></tr>`).join("")
  }</tbody></table>`;
}
async function processSales(text,seller){
  const rows=parseLines(text,seller);
  if(!rows.length) return alert("No pude reconocer productos en esas líneas.");
  if(!firebaseReady) return alert("Primero hay que conectar Firebase. La estructura de la aplicación ya está lista.");
  for(const row of rows) await addDoc(collection(db,"sales"),row);
}
async function processVitrina(id){
  const text=$("vit-"+id).value;
  const rows=parseLines(text,"Vitrina",id);
  if(!rows.length) return alert("No pude reconocer productos.");
  if(!firebaseReady) return alert("Primero hay que conectar Firebase.");
  for(const row of rows) await addDoc(collection(db,"sales"),row);
  $("vit-"+id).value="";
}
document.querySelectorAll(".process").forEach(b=>b.onclick=()=>processSales($(b.dataset.seller.toLowerCase()+"Input").value,b.dataset.seller));
$("logoutBtn").onclick=()=>signOut(auth);
$("loginBtn").onclick=async()=>{
  if(!firebaseReady){$("authMsg").textContent="Firebase todavía no está conectado.";return}
  const email=$("email").value.trim();
  const password=$("password").value;
  if(!email || !password){$("authMsg").textContent="Escribe el correo y la contraseña.";return}
  try{
    $("authMsg").textContent="Iniciando sesión...";
    await signInWithEmailAndPassword(auth,email,password);
  }catch(e){
    console.error("Firebase Auth:",e);
    const code=e?.code||"sin-codigo";
    const messages={
      "auth/invalid-credential":"Las credenciales no son válidas. Verifica el correo y la contraseña.",
      "auth/wrong-password":"La contraseña no coincide con ese usuario.",
      "auth/user-not-found":"Ese correo no existe en Firebase Authentication.",
      "auth/user-disabled":"Ese usuario está deshabilitado en Firebase.",
      "auth/invalid-email":"El correo no tiene un formato válido.",
      "auth/unauthorized-domain":"El dominio de GitHub Pages no está autorizado en Firebase.",
      "auth/invalid-api-key":"La API Key de Firebase no es válida.",
      "auth/network-request-failed":"No se pudo conectar con Firebase. Revisa tu conexión.",
      "auth/too-many-requests":"Firebase bloqueó temporalmente los intentos. Espera unos minutos."
    };
    $("authMsg").textContent=`${messages[code]||"Error de Firebase al iniciar sesión."} (${code})`;
  }
};
$("addVitrinaBtn").onclick=()=>{
  const name=prompt("Nombre de la nueva vitrina:");
  if(name){vitrinas.push({id:crypto.randomUUID(),name:name.toUpperCase()});renderVitrinas();render();}
};
function renameVitrina(id){const v=vitrinas.find(x=>x.id===id);const n=prompt("Nuevo nombre:",v.name);if(n){v.name=n.toUpperCase();renderVitrinas();render()}}
function deleteVitrina(id){if(vitrinas.length<=1)return alert("Debe quedar al menos una vitrina.");if(confirm("¿Eliminar esta vitrina?")){vitrinas=vitrinas.filter(v=>v.id!==id);renderVitrinas();render()}}
$("addProductBtn").onclick=()=>editProduct();
function editProduct(id){
  const p=products.find(x=>x.id===id)||{id:crypto.randomUUID(),name:"",cost:0,vitrinaPrice:0,aliases:[]};
  $("modalTitle").textContent=id?"Editar producto":"Agregar producto";
  $("modalBody").innerHTML=`<div class="form-grid">
    <label class="full">Nombre<input id="pname" value="${p.name}"></label>
    <label>Costo<input id="pcost" type="number" value="${p.cost}"></label>
    <label>Precio vitrina<input id="pvprice" type="number" value="${p.vitrinaPrice}"></label>
    <label class="full">Alias separados por coma<input id="palias" value="${(p.aliases||[]).join(", ")}"></label>
    <div class="full"><button id="saveProduct">Guardar</button></div>
  </div>`;
  $("modal").classList.remove("hidden");
  $("saveProduct").onclick=async()=>{
    const np={...p,name:$("pname").value.trim(),cost:Number($("pcost").value),vitrinaPrice:Number($("pvprice").value),aliases:$("palias").value.split(",").map(x=>x.trim()).filter(Boolean)};
    products=products.filter(x=>x.id!==np.id);products.push(np);$("modal").classList.add("hidden");render();
  };
}
$("closeModal").onclick=()=>$("modal").classList.add("hidden");

function startRealtime(){
  if(!firebaseReady){ $("login").classList.remove("hidden"); $("app").classList.add("hidden"); return; }
  onAuthStateChanged(auth,user=>{
    if(!user){$("login").classList.remove("hidden");$("app").classList.add("hidden");return}
    $("login").classList.add("hidden");$("app").classList.remove("hidden");
    unsub.forEach(fn=>fn());unsub=[];
    unsub.push(onSnapshot(query(collection(db,"sales"),orderBy("date","desc")),snap=>{sales=snap.docs.map(d=>({id:d.id,...d.data()}));render()}));
    renderVitrinas();render();
  });
}
renderVitrinas();render();startRealtime();
