import { useState } from 'react';
import { ethers } from 'ethers';
import confetti from 'canvas-confetti';
import './App.css';

// --- CONFIGURACIÓN ---
// Dirección de tu contrato
const CONTRACT_ADDRESS = "0xBbf0b19E33cCAee777c9B8E2C2F99062e07218F8"; 
// RPC Público para el modo "Solo ver" (Invitados)
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

  // --- CONEXIÓN BLINDADA CON GUÍA PARA USUARIO NUEVO ---
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        // 1. INTENTAR CAMBIAR A POLYGON AMOY
        try {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: "0x13882" }], // 80002 en Hex
            });
        } catch (switchError) {
            // Si la red no existe en la wallet, la agregamos automáticamente
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
        
        // 2. CONECTAR
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        setWallet(signer.address);
        setIsAdmin(true);
        setView('dashboard');

      } catch (err) { 
        console.error(err);
        alert("Error de conexión: Si estás en celular, usa el navegador de MetaMask."); 
      }
    } else { 
        // --- MEJORA: GUÍA PARA QUIEN NO TIENE METAMASK ---
        const confirmar = confirm(
            "⚠️ No detectamos una Billetera Web3 instalada.\n\n" +
            "Para CERTIFICAR imágenes necesitas:\n" +
            "1. Instalar la extensión 'MetaMask'.\n" +
            "2. Crear una cuenta.\n" +
            "3. Tener saldo de prueba (POL).\n\n" +
            "¿Quieres ir a la página de descarga de MetaMask ahora?"
        );
        
        if (confirmar) {
            window.open("https://metamask.io/download/", "_blank");
        }
    }
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

  // VERIFICAR SI YA EXISTE EN BLOCKCHAIN
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
            const fechaSolo = dateObj.toLocaleDateString("es-ES", { 
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
            });
            const horaSolo = dateObj.toLocaleTimeString("es-ES", { 
                hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' 
            });
            
            setFinalData({ autor, fecha: fechaSolo, hora: horaSolo, hash });
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

  // --- FUNCIÓN BLINDADA CON 2 MILLONES DE GAS ---
  const iniciarProcesoCertificacion = async (hashParaCertificar) => {
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contrato = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        // ⚠️ GAS LIMIT: 2,000,000
        const tx = await contrato.certificarImagen(hashParaCertificar, { gasLimit: 2000000 });
        
        setChecks(prev => ({ ...prev, signature: true }));

        await tx.wait(); // Esperamos confirmación
        setChecks(prev => ({ ...prev, blockchain: true }));

        const dateObj = new Date();
        const fechaSolo = dateObj.toLocaleDateString("es-ES", { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
        const horaSolo = dateObj.toLocaleTimeString("es-ES", { 
            hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' 
        });

        setFinalData({ autor: wallet, fecha: fechaSolo, hora: horaSolo, hash: hashParaCertificar });

        setTimeout(() => {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#ffffff', '#bbbbbb'] });
            setView('success');
        }, 1000);
    } catch (error) {
        console.error("Error detallado:", error);
        
        // Manejo de errores
        if (error.code === 4001 || (error.info && error.info.error && error.info.error.code === 4001)) {
             alert("Cancelaste la operación en MetaMask.");
        } else {
             alert("Ocurrió un error en la red. Intenta nuevamente (Gas insuficiente o error RPC).");
        }
        setView('dashboard');
    }
  };

  return (
    <div className="app-container">
      
      {/* VISTA 1: LOGIN */}
      {view === 'login' && (
        <div className="card login-card">
            <h1>🔒 Securi Certify</h1>
            <p>Sistema de Atestación de Contenido Sintético</p>
            
            <button onClick={connectWallet} className="btn-primary">
                🔑 Certificar Imagen
            </button>
            
            {/* BOTÓN EN MAYÚSCULAS */}
            <button onClick={enterPublicMode} className="btn-secondary" style={{borderColor: '#fff', color: '#fff'}}>
                👁️ VALIDAR IMAGEN
            </button>
            
            {/* TEXTO ACLARATORIO */}
            <p style={{fontSize: '0.8rem', marginTop: '15px', opacity: 0.7}}>
                *Validar no requiere conexión con la billetera
            </p>
        </div>
      )}

      {/* DASHBOARD */}
      {view === 'dashboard' && (
        <div className="card dashboard-card">
            <div style={{marginBottom: '20px', fontSize: '0.8rem', opacity: 0.7}}>
                {isAdmin ? `Conectado: ${wallet.slice(0,6)}...` : "Modo Validación"}
            </div>
            
            <h2>{isAdmin ? "Certificar nueva imagen" : "VALIDAR IMAGEN"}</h2>
            
            <div className="options-grid" style={{ display: 'flex', justifyContent: 'center', marginTop: '30px' }}>
                <label className="option-btn" style={{ width: '100%', maxWidth: '200px' }}>
                    <span className="icon">📸</span>
                    <span>Tomar Foto / Subir</span>
                    <input type="file" onChange={handleFile} accept="image/*" hidden />
                </label>
            </div>
             
             <button onClick={logout} className="btn-secondary" style={{marginTop: '30px', fontSize: '0.8rem'}}>
                ← Volver al Inicio
             </button>
        </div>
      )}

      {/* PROCESANDO */}
      {view === 'processing' && (
        <div className="card processing-card">
            <h2>{isAdmin ? "Certificando..." : "Validando..."}</h2>
            {previewUrl && <div className="mini-preview-container"><img src={previewUrl} className="mini-preview" /></div>}
            
            <div className="checklist">
                <div className="check-item active">
                    <span className="check-icon">⚡</span>
                    <div className="check-text">
                        <strong>Huella Digital (Hash)</strong>
                        <code style={{fontSize: '0.6rem', color: '#aaa'}}>
                            {fileHash ? `${fileHash.slice(0,15)}...` : "Calculando..."}
                        </code>
                    </div>
                </div>

                {isAdmin && (
                    <div className="check-item active">
                        <span className="check-icon">⚡</span>
                        <div className="check-text">
                            <strong>Billetera Conectada</strong>
                            <code style={{fontSize: '0.6rem', color: '#aaa'}}>{wallet.slice(0,10)}...</code>
                        </div>
                    </div>
                )}

                <div className={`check-item ${checks.blockchain ? 'active' : ''}`}>
                    <span className="check-icon">{checks.blockchain ? '✅' : '⏳'}</span>
                    <div className="check-text">
                        <strong>Confirmación Blockchain</strong>
                        <small>{checks.blockchain ? '¡Confirmado!' : 'Esperando bloque...'}</small>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* ÉXITO (NUEVA CERTIFICACIÓN) */}
      {view === 'success' && (
         <div className="card success-card">
            <div style={{fontSize: '3rem', marginBottom: '10px'}}>🎉</div>
            <h1>¡Certificación Exitosa!</h1>
            
            {previewUrl && <div className="success-image-container"><img src={previewUrl} className="success-image-preview" /></div>}

            {/* BOTÓN DESCARGAR */}
            <a href={previewUrl} download={`certificado_${finalData?.hash?.slice(0,6)}.png`} style={{textDecoration: 'none', width: '100%'}}>
                 <button className="btn-secondary" style={{marginTop: '0', marginBottom: '15px', borderColor: '#fff', color: '#fff'}}>
                    ⬇️ Guardar Imagen
                 </button>
            </a>

            <div className="author-box">
                <span style={{opacity: 0.6, fontSize: '0.8rem'}}>Certificado por (Wallet):</span>
                <code style={{display: 'block', marginTop: '5px', color: '#fff'}}>{finalData?.autor}</code>
            </div>

            <div className="info-grid">
                <div className="info-box">
                    <span className="info-label">📅 FECHA</span>
                    <span className="info-value">{finalData?.fecha}</span>
                </div>
                <div className="info-box">
                    <span className="info-label">⏰ HORA (Local)</span>
                    <span className="info-value">{finalData?.hora}</span>
                </div>
            </div>

            <div className="checklist" style={{background: 'rgba(255,255,255,0.05)', marginTop: '20px'}}>
                <div className="check-item active" style={{opacity: 1, borderBottom: 'none'}}>
                    <span className="check-icon">✅</span>
                    <div className="check-text">
                        <strong>Hash Inmutable Registrado</strong>
                        <code style={{fontSize: '0.7rem', color: '#fff'}}>{finalData?.hash?.slice(0,25)}...</code>
                    </div>
                </div>
            </div>
            <button onClick={() => setView('dashboard')} className="btn-primary" style={{marginTop: '20px'}}>Continuar</button>
         </div>
      )}

      {/* YA EXISTE (IMAGEN CERTIFICADA) */}
      {view === 'exists' && (
        <div className="card exists-card" style={{borderColor: '#00ff88'}}>
            <div style={{fontSize: '3rem', marginBottom: '10px'}}>✅</div>
            
            <h1 style={{color: '#00ff88', marginBottom: '5px', fontSize: '1.8rem'}}>IMAGEN CERTIFICADA</h1>
            <p style={{fontSize: '0.9rem', opacity: 0.8, marginTop: '0', marginBottom: '20px'}}>
                Este archivo cuenta con un registro inmutable en Polygon.
            </p>
            
            {previewUrl && <div className="success-image-container" style={{borderColor: '#00ff88'}}><img src={previewUrl} className="success-image-preview" /></div>}

            {/* BOTÓN DESCARGAR */}
            <a href={previewUrl} download={`certificado_valido_${finalData?.hash?.slice(0,6)}.png`} style={{textDecoration: 'none', width: '100%'}}>
                 <button className="btn-secondary" style={{marginTop: '0', marginBottom: '15px', borderColor: '#00ff88', color: '#00ff88'}}>
                    ⬇️ Guardar Copia
                 </button>
            </a>

            <div className="author-box" style={{borderColor: '#00ff88', background: 'rgba(0, 255, 136, 0.05)'}}>
                <span style={{opacity: 0.8, fontSize: '0.8rem', color: '#00ff88'}}>👤 Certificado por (Autor):</span>
                <code style={{display: 'block', marginTop: '5px', color: '#fff', fontSize: '0.85rem'}}>{finalData?.autor}</code>
            </div>

            <div className="info-grid">
                <div className="info-box" style={{borderColor: '#00ff88'}}>
                    <span className="info-label" style={{color: '#00ff88'}}>📅 FECHA</span>
                    <span className="info-value">{finalData?.fecha}</span>
                </div>
                <div className="info-box" style={{borderColor: '#00ff88'}}>
                    <span className="info-label" style={{color: '#00ff88'}}>⏰ HORA (Local)</span>
                    <span className="info-value">{finalData?.hora}</span>
                </div>
            </div>

            <div className="checklist" style={{borderColor: '#00ff88', background: 'rgba(0,255,136,0.05)', marginTop: '20px'}}>
                <div className="check-item active" style={{opacity: 1, borderBottom: 'none'}}>
                    <span className="check-icon">✅</span>
                    <div className="check-text">
                        <strong>Hash Coincide (Integridad)</strong>
                        <code style={{fontSize: '0.7rem'}}>{finalData?.hash?.slice(0,25)}...</code>
                    </div>
                </div>
            </div>
            <button onClick={() => setView('dashboard')} className="btn-secondary" style={{borderColor: '#00ff88', color: '#00ff88'}}>Verificar Otra</button>
        </div>
      )}

      {/* NO EXISTE (ERROR) */}
      {view === 'not-found' && (
        <div className="card error-card" style={{borderColor: '#ff3333'}}>
            <div style={{fontSize: '3rem', marginBottom: '10px'}}>❌</div>
            
            <h1 style={{color: '#ff3333'}}>Imagen no certificada</h1>
            <p style={{fontSize: '0.9rem', opacity: 0.8}}>El sistema no reconoce este archivo en la Blockchain.</p>
            
            {previewUrl && <div className="success-image-container" style={{borderColor: '#ff3333'}}><img src={previewUrl} style={{filter: 'grayscale(100%)'}} className="success-image-preview" /></div>}

            <button onClick={() => setView('dashboard')} className="btn-secondary" style={{borderColor: '#ff3333', color: '#ff3333'}}>Probar Otra</button>
        </div>
      )}

    </div>
  );
}

export default App;