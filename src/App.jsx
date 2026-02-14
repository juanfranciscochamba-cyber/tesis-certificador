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
  const [checks, setChecks] = useState({ hash: false, signature: false, blockchain: false });
  
  // ESTADOS PARA MENÚ Y MODAL
  const [showMenu, setShowMenu] = useState(false); 
  const [showModal, setShowModal] = useState(false); // Controla si se ve la ventana emergente
  const [modalStep, setModalStep] = useState(1);     // Paso 1: Pregunta | Paso 2: Instrucciones

  // --- 1. LÓGICA DE CONEXIÓN (SE EJECUTA AL DAR CLICK EN "SÍ") ---
  const connectWallet = async () => {
    // Cerramos el modal primero
    setShowModal(false);

    if (window.ethereum) {
      try {
        // Intentar cambiar a Polygon Amoy
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

      } catch (err) { 
        console.error(err);
        alert("Error de conexión. Revisa tu extensión de MetaMask."); 
      }
    } else { 
       // Si dijo que SÍ tenía, pero el navegador no detecta nada:
       alert("No detectamos la extensión. Asegúrate de tener MetaMask instalado.");
       setModalStep(2); // Lo mandamos a las instrucciones
       setShowModal(true);
    }
  };

  const openCertifyModal = () => {
    setModalStep(1); // Reiniciar al paso de la pregunta
    setShowModal(true);
  };

  const enterPublicMode = () => {
    setWallet("Invitado");
    setIsAdmin(false);
    setView('dashboard');
  };

  const logout = () => {
    setWallet(null);
    setIsAdmin(false);
    setView('login');
    setFileHash(null);
    setPreviewUrl(null);
    setFinalData(null);
    setShowMenu(false);
  };

  // LÓGICA PRINCIPAL: PROCESAR IMAGEN
  const handleFile = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const hash = ethers.keccak256(bytes);
      setFileHash(hash);
      verificarExistencia(hash);
    }
  };

  // VERIFICAR EXISTENCIA
  const verificarExistencia = async (hash) => {
    try {
        setView('processing');
        setChecks({ hash: true, signature: false, blockchain: false });

        let provider;
        if (isAdmin && window.ethereum) {
            provider = new ethers.BrowserProvider(window.ethereum);
        } else {
            provider = new ethers.JsonRpcProvider(RPC_URL);
        }

        const contrato = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const [autor, timestamp, existe] = await contrato.verificarImagen(hash);

        if (existe) {
            const dateObj = new Date(Number(timestamp) * 1000);
            setFinalData({ 
                autor, 
                fecha: dateObj.toLocaleDateString("es-ES"), 
                hora: dateObj.toLocaleTimeString("es-ES"), 
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
        console.error("Error:", error);
        alert("Error de conexión con Polygon. Intenta de nuevo.");
        setView('dashboard');
    }
  };

  // CERTIFICAR
  const iniciarProcesoCertificacion = async (hashParaCertificar) => {
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contrato = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        const tx = await contrato.certificarImagen(hashParaCertificar, { gasLimit: 2000000 });
        setChecks(prev => ({ ...prev, signature: true }));

        await tx.wait(); 
        setChecks(prev => ({ ...prev, blockchain: true }));

        const dateObj = new Date();
        setFinalData({ 
            autor: wallet, 
            fecha: dateObj.toLocaleDateString("es-ES"), 
            hora: dateObj.toLocaleTimeString("es-ES"), 
            hash: hashParaCertificar 
        });

        setTimeout(() => {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#ffffff', '#bbbbbb'] });
            setView('success');
        }, 1000);
    } catch (error) {
        console.error("Error:", error);
        setView('dashboard');
    }
  };

  return (
    <div className="app-container">
      
      {/* --- MODAL (VENTANA EMERGENTE) --- */}
      {showModal && (
        <div className="modal-overlay">
            <div className="modal-content">
                <button className="close-modal" onClick={() => setShowModal(false)}>×</button>
                
                {/* PASO 1: LA PREGUNTA */}
                {modalStep === 1 && (
                    <>
                        <h2 style={{color: '#fff', fontSize: '1.4rem'}}>🦊 Conectar Billetera</h2>
                        <p style={{color: '#aaa', marginBottom: '20px'}}>
                            ¿Ya tienes una cuenta de MetaMask configurada?
                        </p>
                        <div className="modal-btn-group">
                            <button onClick={connectWallet} className="modal-btn-yes">
                                SÍ, Conectar
                            </button>
                            <button onClick={() => setModalStep(2)} className="modal-btn-no">
                                NO, Ayúdame
                            </button>
                        </div>
                    </>
                )}

                {/* PASO 2: LAS INSTRUCCIONES */}
                {modalStep === 2 && (
                    <>
                        <h2 style={{color: '#fff', fontSize: '1.2rem', textAlign: 'left'}}>🛠️ Configuración Inicial</h2>
                        <ol className="step-list">
                            <li>
                                <strong>1. Instalar MetaMask:</strong> Descarga la extensión oficial para tu navegador.<br/>
                                <a href="https://metamask.io/download/" target="_blank" className="step-link">Ir a descargar ↗</a>
                            </li>
                            <li>
                                <strong>2. Crear Cuenta:</strong> Abre la extensión y sigue los pasos para "Crear nueva cartera".
                            </li>
                            <li>
                                <strong>3. Conseguir Saldo (POL):</strong> Necesitas monedas de prueba para pagar el gas.<br/>
                                <a href="https://faucet.polygon.technology/" target="_blank" className="step-link">Ir al Faucet ↗</a>
                            </li>
                        </ol>
                        <button onClick={() => setModalStep(1)} className="btn-primary" style={{marginTop: '10px', fontSize: '0.9rem', padding: '10px'}}>
                            ← Volver
                        </button>
                    </>
                )}
            </div>
        </div>
      )}


      {/* VISTA 1: LOGIN */}
      {view === 'login' && (
        <div className="card login-card">
            <h1>🔒 Securi Certify</h1>
            <p>Sistema de Atestación de Contenido Sintético</p>
            
            {/* AHORA ABRE EL MODAL EN LUGAR DE CONECTAR DIRECTO */}
            <button onClick={openCertifyModal} className="btn-primary">
                🔑 Certificar Imagen
            </button>
            
            <button onClick={enterPublicMode} className="btn-secondary" style={{borderColor: '#fff', color: '#fff'}}>
                👁️ VALIDAR IMAGEN
            </button>
            
            <p style={{fontSize: '0.8rem', marginTop: '15px', opacity: 0.7}}>
                *Validar no requiere conexión con MetaMask
            </p>
        </div>
      )}

      {/* DASHBOARD (CON HEADER Y MENÚ DE DESCONEXIÓN) */}
      {view === 'dashboard' && (
        <div className="card dashboard-card">
            
            {/* --- HEADER SUPERIOR --- */}
            <div className="card-header">
                <h3 className="header-title">🔒 SECURI CERTIFY</h3>
                
                {isAdmin && (
                    <div style={{position: 'relative'}}>
                        {/* Botón de Engranaje */}
                        <button onClick={() => setShowMenu(!showMenu)} className="settings-btn">
                            ⚙️
                        </button>

                        {/* Menú Desplegable */}
                        {showMenu && (
                            <div className="wallet-menu">
                                <h3>Cuenta Conectada</h3>
                                <div className="wallet-address-box">
                                    <span style={{color: '#00ff88', fontSize: '1.2rem', marginRight: '5px'}}>●</span>
                                    {wallet}
                                </div>
                                <div style={{fontSize: '0.75rem', color: '#666', marginBottom: '15px'}}>
                                    Red: Polygon Amoy Testnet
                                </div>
                                <button onClick={logout} className="menu-btn-logout">
                                    🔌 Desconectar
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <h2 style={{marginTop: '10px'}}>{isAdmin ? "Certificar nueva imagen" : "VALIDAR IMAGEN"}</h2>
            <p style={{marginBottom: '30px', color: '#888', fontSize: '0.9rem'}}>
                {isAdmin 
                    ? "Sube una imagen para registrar su huella digital en la Blockchain." 
                    : "Sube una imagen para verificar si es auténtica."}
            </p>
            
            <div className="options-grid" style={{ display: 'flex', justifyContent: 'center' }}>
                <label className="option-btn" style={{ width: '100%', maxWidth: '250px' }}>
                    <span className="icon" style={{fontSize: '2rem'}}>📸</span>
                    <span style={{fontSize: '1rem'}}>Seleccionar Archivo</span>
                    <input type="file" onChange={handleFile} accept="image/*" hidden />
                </label>
            </div>
             
             {!isAdmin && (
                 <button onClick={logout} className="btn-secondary" style={{marginTop: '30px', fontSize: '0.8rem'}}>
                    ← Volver al Inicio
                 </button>
             )}
        </div>
      )}

      {/* VISTAS DE PROCESO (PROCESSING, SUCCESS, EXISTS, ERROR) SIGUEN IGUAL... */}
      {view === 'processing' && (
        <div className="card processing-card">
            <h2>{isAdmin ? "Certificando..." : "Validando..."}</h2>
            {previewUrl && <div className="mini-preview-container"><img src={previewUrl} className="mini-preview" /></div>}
            
            <div className="checklist">
                <div className="check-item active">
                    <span className="check-icon">⚡</span>
                    <div className="check-text">
                        <strong>Huella Digital (Hash)</strong>
                        <code style={{fontSize: '0.6rem', color: '#aaa'}}>{fileHash ? `${fileHash.slice(0,15)}...` : "Calculando..."}</code>
                    </div>
                </div>
                {/* Checks adicionales según lógica... */}
            </div>
        </div>
      )}

      {view === 'success' && (
         <div className="card success-card">
            <div style={{fontSize: '3rem', marginBottom: '10px'}}>🎉</div>
            <h1>¡Certificación Exitosa!</h1>
            {previewUrl && <div className="success-image-container"><img src={previewUrl} className="success-image-preview" /></div>}
            
            <a href={previewUrl} download={`certificado_${finalData?.hash?.slice(0,6)}.png`} style={{textDecoration: 'none', width: '100%'}}>
                 <button className="btn-secondary" style={{marginTop: '0', marginBottom: '15px', borderColor: '#fff', color: '#fff'}}>⬇️ Guardar Imagen</button>
            </a>
            <div className="author-box"><code style={{display: 'block', color: '#fff'}}>{finalData?.autor}</code></div>
            <button onClick={() => setView('dashboard')} className="btn-primary" style={{marginTop: '20px'}}>Continuar</button>
         </div>
      )}

      {view === 'exists' && (
        <div className="card exists-card" style={{borderColor: '#00ff88'}}>
            <div style={{fontSize: '3rem', marginBottom: '10px'}}>✅</div>
            <h1 style={{color: '#00ff88'}}>IMAGEN CERTIFICADA</h1>
            {previewUrl && <div className="success-image-container" style={{borderColor: '#00ff88'}}><img src={previewUrl} className="success-image-preview" /></div>}
            <div className="info-grid">
                <div className="info-box" style={{borderColor: '#00ff88'}}><span className="info-value">{finalData?.fecha}</span></div>
            </div>
            <button onClick={() => setView('dashboard')} className="btn-secondary" style={{marginTop: '20px', borderColor: '#00ff88', color: '#00ff88'}}>Verificar Otra</button>
        </div>
      )}

      {view === 'not-found' && (
        <div className="card error-card" style={{borderColor: '#ff3333'}}>
            <div style={{fontSize: '3rem', marginBottom: '10px'}}>❌</div>
            <h1 style={{color: '#ff3333'}}>No certificada</h1>
            {previewUrl && <div className="success-image-container" style={{borderColor: '#ff3333'}}><img src={previewUrl} style={{filter: 'grayscale(100%)'}} className="success-image-preview" /></div>}
            <button onClick={() => setView('dashboard')} className="btn-secondary" style={{borderColor: '#ff3333', color: '#ff3333'}}>Probar Otra</button>
        </div>
      )}

    </div>
  );
}

export default App;