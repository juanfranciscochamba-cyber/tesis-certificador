import { useState } from 'react';
import { ethers } from 'ethers';
import confetti from 'canvas-confetti';
import './App.css';

// --- CONFIGURACIÓN ---
const CONTRACT_ADDRESS = "0xBbf0b19E33cCAee777c9B8E2C2F99062e07218F8"; 
const RPC_URL = "https://polygon-amoy.drpc.org";

const CONTRACT_ABI = [
    { "inputs": [{"internalType": "bytes32","name": "_hashImagen","type": "bytes32"}], "name": "certificarImagen", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{"internalType": "bytes32","name": "_hashImagen","type": "bytes32"}], "name": "verificarImagen", "outputs": [{"internalType": "address","name": "","type": "address"},{"internalType": "uint256","name": "","type": "uint256"},{"internalType": "bool","name": "","type": "bool"}], "stateMutability": "view", "type": "function" },
    { "anonymous": false, "inputs": [{"indexed": true,"internalType": "bytes32","name": "hashImagen","type": "bytes32"}, {"indexed": true,"internalType": "address","name": "autor","type": "address"}, {"indexed": false,"internalType": "uint256","name": "timestamp","type": "uint256"}], "name": "NuevaCertificacion", "type": "event" }
];

function App() {
  const [view, setView] = useState('login'); 
  const [wallet, setWallet] = useState(null);
  const [fileHash, setFileHash] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [finalData, setFinalData] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // ESTADOS DE PROGRESO
  const [progress, setProgress] = useState({ hashing: false, signing: false, mining: false, done: false });
  // ESTADOS DE UI
  const [showMenu, setShowMenu] = useState(false); 
  const [showModal, setShowModal] = useState(false); 
  const [modalStep, setModalStep] = useState(1); 

  // --- COMPONENTE HEADER (Ahora visible en todas las pantallas) ---
  const Header = () => (
      <div className="card-header">
          <div className="header-title">
             <span style={{fontSize:'1.2rem', marginRight:'10px'}}>🔒</span> SECURI CERTIFY
          </div>
          
          {/* El engranaje se muestra si es Admin (Conectado) */}
          {isAdmin && (
              <div style={{position: 'relative'}}>
                  <button onClick={() => setShowMenu(!showMenu)} className="settings-btn" style={{color: view === 'exists' ? '#00ff88' : '#fff'}}>
                      ⚙️
                  </button>
                  {showMenu && (
                      <div className="wallet-menu">
                          <p style={{margin: '0 0 5px 0', fontSize: '0.7rem', color: '#888'}}>CUENTA CONECTADA</p>
                          <code style={{display:'block', marginBottom:'15px', color: '#fff'}}>{wallet.slice(0,10)}...</code>
                          <button onClick={logout} className="btn-secondary" style={{padding: '10px', fontSize: '0.75rem', marginTop: '0', borderColor: '#ff5555', color: '#ff5555'}}>
                              🔄 Cerrar Sesión / Cambiar
                          </button>
                      </div>
                  )}
              </div>
          )}
      </div>
  );

  // --- LÓGICA DE CONEXIÓN INTELIGENTE ---
  const checkConnectionAndOpen = async () => {
    // Si MetaMask ya tiene una cuenta seleccionada, saltamos la pregunta
    if (window.ethereum && window.ethereum.selectedAddress) {
        connectWallet();
    } else {
        // Si no, preguntamos
        setModalStep(1); 
        setShowModal(true);
    }
  };

  const connectWallet = async () => {
    setShowModal(false);
    if (window.ethereum) {
      try {
        try {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: "0x13882" }],
            });
        } catch (switchError) {
            if (switchError.code === 4902) {
                await window.ethereum.request({
                    method: "wallet_addEthereumChain",
                    params: [{
                        chainId: "0x13882",
                        rpcUrls: ["https://rpc-amoy.polygon.technology/"],
                        chainName: "Polygon Amoy Testnet",
                        nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
                        blockExplorerUrls: ["https://amoy.polygonscan.com/"]
                    }]
                });
            }
        }
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        setWallet(signer.address);
        setIsAdmin(true);
        setView('dashboard');
      } catch (err) { alert("Error al conectar. Revisa MetaMask."); }
    } else { 
       alert("No se detectó MetaMask.");
    }
  };
  
  const enterPublicMode = () => { setWallet("Invitado"); setIsAdmin(false); setView('dashboard'); };

  const logout = () => {
    setWallet(null); setIsAdmin(false); setView('login');
    setFileHash(null); setPreviewUrl(null); setFinalData(null); setShowMenu(false);
  };

  const handleFile = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setView('processing');
      setProgress({ hashing: true, signing: false, mining: false, done: false });
      
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const hash = ethers.keccak256(bytes);
      setFileHash(hash);
      
      setTimeout(() => verificarExistencia(hash), 1500); 
    }
  };

  const verificarExistencia = async (hash) => {
    try {
        let provider;
        if (isAdmin && window.ethereum) {
            provider = new ethers.BrowserProvider(window.ethereum);
        } else {
            provider = new ethers.JsonRpcProvider(RPC_URL);
        }
        const contrato = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const [autor, timestamp, existe] = await contrato.verificarImagen(hash);

        if (existe) {
            // FECHA CON ZONA HORARIA
            const dateObj = new Date(Number(timestamp) * 1000);
            setFinalData({ 
                autor, 
                fecha: dateObj.toLocaleDateString("es-ES", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), 
                hora: dateObj.toLocaleTimeString("es-ES", { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }), // Agrega GMT/UTC
                hash 
            });
            setView('exists');
        } else {
            if (isAdmin) {
                iniciarProcesoCertificacion(hash);
            } else {
                setView('not-found');
            }
        }
    } catch (error) {
        alert("Error de red."); setView('dashboard');
    }
  };

  const iniciarProcesoCertificacion = async (hashParaCertificar) => {
    try {
        setProgress({ hashing: true, signing: true, mining: false, done: false });
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contrato = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        const tx = await contrato.certificarImagen(hashParaCertificar, { gasLimit: 2000000 });
        
        setProgress({ hashing: true, signing: true, mining: true, done: false });
        await tx.wait(); 
        setProgress({ hashing: true, signing: true, mining: true, done: true });

        const dateObj = new Date();
        setFinalData({ 
            autor: wallet, 
            fecha: dateObj.toLocaleDateString("es-ES", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), 
            hora: dateObj.toLocaleTimeString("es-ES", { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }), 
            hash: hashParaCertificar 
        });

        setTimeout(() => {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#ffffff', '#bbbbbb'] });
            setView('success');
        }, 1000);
    } catch (error) {
        console.error(error);
        setView('dashboard'); 
    }
  };

  return (
    <div className="app-container">
      
      {/* --- MODAL --- */}
      {showModal && (
        <div className="modal-overlay">
            <div className="modal-content">
                <button className="close-modal" onClick={() => setShowModal(false)}>×</button>
                {modalStep === 1 ? (
                    <>
                        <h2>🦊 Conectar Billetera</h2>
                        <p>¿Ya tienes una cuenta de MetaMask configurada?</p>
                        <div className="modal-buttons">
                            <button onClick={connectWallet} className="modal-yes">SÍ, Conectar</button>
                            <button onClick={() => setModalStep(2)} className="modal-no">NO, Ayúdame</button>
                        </div>
                    </>
                ) : (
                    <>
                        <h2 style={{fontSize:'1.2rem', textAlign:'left'}}>🛠️ Configuración Rápida</h2>
                        <ol className="step-list">
                            <li><strong>1. Instalar:</strong> Descarga la extensión <a href="https://metamask.io/download/" target="_blank">MetaMask</a>.</li>
                            <li><strong>2. Crear Cuenta:</strong> Abre la extensión y crea tu cartera.</li>
                            <li><strong>3. Saldo Gratis:</strong> Obtén monedas de prueba en el <a href="https://faucet.polygon.technology/" target="_blank">Faucet</a>.</li>
                        </ol>
                        <button onClick={() => setModalStep(1)} className="btn-secondary" style={{padding:'10px'}}>← Volver</button>
                    </>
                )}
            </div>
        </div>
      )}

      {/* --- VISTA 1: LOGIN --- */}
      {view === 'login' && (
        <div className="card">
            <Header /> {/* Header desde el inicio */}
            
            <p style={{marginTop: '20px'}}>Sistema de Atestación de Contenido Sintético</p>
            
            <button onClick={checkConnectionAndOpen} className="btn-primary">
                🔑 CERTIFICAR IMAGEN
            </button>
            <button onClick={enterPublicMode} className="btn-secondary">
                👁️ VALIDAR IMAGEN
            </button>
            <p style={{marginTop: '20px', fontSize: '0.8rem'}}>*Validar no requiere conexión con MetaMask</p>
        </div>
      )}

      {/* --- DASHBOARD --- */}
      {view === 'dashboard' && (
        <div className="card">
            <Header />
            
            <h2>{isAdmin ? "Certificar Nueva Imagen" : "Validar Imagen"}</h2>
            <p>Selecciona el archivo para generar su huella digital.</p>
            
            <div className="options-grid" style={{display:'flex', justifyContent:'center'}}>
                <label className="btn-secondary" style={{display:'block', width:'200px', padding:'30px'}}>
                    <span style={{fontSize:'2rem'}}>📸</span><br/>
                    Subir Foto
                    <input type="file" onChange={handleFile} accept="image/*" hidden />
                </label>
            </div>
            
            {!isAdmin && (
                <button onClick={logout} className="btn-secondary" style={{border:'none', fontSize:'0.8rem', marginTop:'30px'}}>
                   ← Volver al Inicio
                </button>
            )}
        </div>
      )}

      {/* --- PROCESANDO --- */}
      {view === 'processing' && (
        <div className="card">
             <Header />
             <h2>Procesando...</h2>
             {previewUrl && <div className="preview-box"><img src={previewUrl} className="preview-img" /></div>}
             
             <div className="checklist">
                 <div className={`check-row ${progress.hashing ? 'active' : ''}`}>
                     <span className="check-icon">{progress.hashing ? '✅' : '⏳'}</span>
                     <span>Generando Huella Digital (Hash)</span>
                 </div>
                 {isAdmin && (
                     <div className={`check-row ${progress.signing ? 'active' : ''}`}>
                        <span className="check-icon">{progress.signing ? '✅' : '⏳'}</span>
                        <span>Firmando Transacción (MetaMask)</span>
                     </div>
                 )}
                 <div className={`check-row ${progress.mining ? 'active' : ''}`}>
                     <span className="check-icon">{progress.mining ? '✅' : '⏳'}</span>
                     <span>Confirmando en Polygon Blockchain</span>
                 </div>
             </div>
        </div>
      )}

      {/* --- ÉXITO / EXISTE --- */}
      {(view === 'success' || view === 'exists') && (
         <div className={`card ${view === 'exists' ? 'exists-card' : 'success-card'}`}>
            <Header />
            
            {view === 'success' ? (
                <>
                    <div style={{fontSize:'3rem'}}>🎉</div>
                    <h1>¡CERTIFICACIÓN EXITOSA!</h1>
                </>
            ) : (
                <>
                    <div style={{fontSize:'3rem'}}>✅</div>
                    <h1 style={{color: '#00ff88'}}>IMAGEN CERTIFICADA</h1>
                </>
            )}

            {previewUrl && <div className="preview-box"><img src={previewUrl} className="preview-img" /></div>}

            <div className="author-box">
                <div className="label" style={{color: view==='exists'?'#00ff88':'#fff'}}>👤 Certificado por (Autor):</div>
                <code style={{color:'#fff', wordBreak:'break-all'}}>{finalData?.autor}</code>
            </div>

            <div className="info-grid">
                <div className="info-item">
                    <span className="label">📅 FECHA</span>
                    <span className="value">{finalData?.fecha}</span>
                </div>
                <div className="info-item">
                    <span className="label">⏰ HORA (Local)</span>
                    <span className="value">{finalData?.hora}</span>
                </div>
            </div>

            <div className="author-box">
                <div className="label" style={{color: view==='exists'?'#00ff88':'#fff'}}>🛡️ Hash Coincide (Integridad)</div>
                <code style={{color:'#aaa', fontSize:'0.7rem'}}>{finalData?.hash}</code>
            </div>

            <a href={previewUrl} download={`certificado_${finalData?.hash.slice(0,6)}.png`} style={{textDecoration:'none'}}>
                 <button className="btn-primary">⬇️ Descargar Copia</button>
            </a>
            
            <button onClick={() => setView('dashboard')} className="btn-secondary" style={{color: view==='exists'?'#00ff88':'#fff', borderColor: view==='exists'?'#00ff88':'#fff'}}>
                Verificar Otra
            </button>
         </div>
      )}

      {/* --- NO ENCONTRADO --- */}
      {view === 'not-found' && (
        <div className="card error-card">
            <Header />
            <div style={{fontSize:'3rem'}}>❌</div>
            <h1 style={{color:'#ff3333'}}>NO CERTIFICADA</h1>
            <p>Esta imagen no tiene registro en la Blockchain.</p>
            {previewUrl && <div className="preview-box" style={{borderColor:'#ff3333'}}><img src={previewUrl} className="preview-img" style={{filter:'grayscale(1)'}} /></div>}
            <button onClick={() => setView('dashboard')} className="btn-secondary" style={{color:'#ff3333', borderColor:'#ff3333'}}>Intentar Otra</button>
        </div>
      )}

    </div>
  );
}

export default App;