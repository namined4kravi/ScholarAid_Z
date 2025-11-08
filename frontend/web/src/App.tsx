import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface ScholarshipData {
  id: string;
  name: string;
  income: string;
  academicScore: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [scholarships, setScholarships] = useState<ScholarshipData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applying, setApplying] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newApplication, setNewApplication] = useState({ name: "", income: "", score: "" });
  const [selectedScholarship, setSelectedScholarship] = useState<ScholarshipData | null>(null);
  const [decryptedIncome, setDecryptedIncome] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [userHistory, setUserHistory] = useState<string[]>([]);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const scholarshipsList: ScholarshipData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          scholarshipsList.push({
            id: businessId,
            name: businessData.name,
            income: businessId,
            academicScore: businessId,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setScholarships(scholarshipsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const applyScholarship = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setApplying(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Applying with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const incomeValue = parseInt(newApplication.income) || 0;
      const businessId = `scholarship-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, incomeValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newApplication.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newApplication.score) || 0,
        0,
        "Scholarship Application"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction..." });
      await tx.wait();
      
      setUserHistory(prev => [...prev, `Applied for ${newApplication.name} at ${new Date().toLocaleTimeString()}`]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Application submitted!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowApplyModal(false);
      setNewApplication({ name: "", income: "", score: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setApplying(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      setUserHistory(prev => [...prev, `Decrypted income data: $${clearValue} at ${new Date().toLocaleTimeString()}`]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Income verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "System is available!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredScholarships = scholarships.filter(scholarship =>
    scholarship.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    scholarship.creator.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedScholarships = filteredScholarships.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredScholarships.length / itemsPerPage);

  const renderStatistics = () => {
    const totalApplications = scholarships.length;
    const verifiedApplications = scholarships.filter(s => s.isVerified).length;
    const avgScore = scholarships.length > 0 
      ? scholarships.reduce((sum, s) => sum + s.publicValue1, 0) / scholarships.length 
      : 0;
    
    const recentApplications = scholarships.filter(s => 
      Date.now()/1000 - s.timestamp < 60 * 60 * 24 * 7
    ).length;

    return (
      <div className="stats-grid">
        <div className="stat-card neon-purple">
          <h3>Total Applications</h3>
          <div className="stat-value">{totalApplications}</div>
          <div className="stat-trend">+{recentApplications} this week</div>
        </div>
        
        <div className="stat-card neon-blue">
          <h3>Verified Income</h3>
          <div className="stat-value">{verifiedApplications}/{totalApplications}</div>
          <div className="stat-trend">FHE Verified</div>
        </div>
        
        <div className="stat-card neon-pink">
          <h3>Avg Academic Score</h3>
          <div className="stat-value">{avgScore.toFixed(1)}/10</div>
          <div className="stat-trend">Performance</div>
        </div>
      </div>
    );
  };

  const renderFHEProcess = () => {
    return (
      <div className="fhe-process">
        <div className="process-step metal-step">
          <div className="step-icon">🔐</div>
          <div className="step-content">
            <h4>Income Encryption</h4>
            <p>Sensitive income data encrypted with FHE technology</p>
          </div>
        </div>
        <div className="process-arrow">→</div>
        <div className="process-step metal-step">
          <div className="step-icon">⚡</div>
          <div className="step-content">
            <h4>On-chain Storage</h4>
            <p>Encrypted data stored securely on blockchain</p>
          </div>
        </div>
        <div className="process-arrow">→</div>
        <div className="process-step metal-step">
          <div className="step-icon">🔍</div>
          <div className="step-content">
            <h4>Homomorphic Verification</h4>
            <p>Verify eligibility without revealing income</p>
          </div>
        </div>
        <div className="process-arrow">→</div>
        <div className="process-step metal-step">
          <div className="step-icon">✅</div>
          <div className="step-content">
            <h4>Secure Approval</h4>
            <p>Privacy-preserving scholarship approval</p>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header metal-header">
          <div className="logo">
            <h1 className="neon-title">ScholarAid_Z 🔐</h1>
            <p>Privacy-Preserving Scholarships</p>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt metal-bg">
          <div className="connection-content">
            <div className="connection-icon">🎓</div>
            <h2>Connect Your Wallet to Begin</h2>
            <p>Access confidential scholarship applications with FHE technology</p>
            <div className="connection-steps">
              <div className="step metal-step">
                <span>1</span>
                <p>Connect your wallet securely</p>
              </div>
              <div className="step metal-step">
                <span>2</span>
                <p>Initialize FHE encryption system</p>
              </div>
              <div className="step metal-step">
                <span>3</span>
                <p>Apply with privacy protection</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen metal-bg">
        <div className="fhe-spinner metal-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Securing your privacy with homomorphic encryption</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen metal-bg">
      <div className="fhe-spinner metal-spinner"></div>
      <p>Loading confidential scholarship system...</p>
    </div>
  );

  return (
    <div className="app-container metal-theme">
      <header className="app-header metal-header">
        <div className="logo">
          <h1 className="neon-title">ScholarAid_Z 🔐</h1>
          <p>隱私獎學金 • Confidential Scholarship</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="action-btn metal-btn neon-blue">
            Check System
          </button>
          <button onClick={() => setShowApplyModal(true)} className="action-btn metal-btn neon-pink">
            + New Application
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="dashboard-panel metal-panel">
          <h2>Scholarship Analytics Dashboard</h2>
          {renderStatistics()}
          
          <div className="fhe-explainer metal-panel">
            <h3>FHE Privacy Protection Flow</h3>
            {renderFHEProcess()}
          </div>
        </div>
        
        <div className="applications-panel metal-panel">
          <div className="panel-header">
            <h2>Scholarship Applications</h2>
            <div className="header-controls">
              <div className="search-box metal-input">
                <input 
                  type="text" 
                  placeholder="Search applications..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button onClick={loadData} className="action-btn metal-btn" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="applications-list">
            {paginatedScholarships.length === 0 ? (
              <div className="no-applications metal-panel">
                <p>No scholarship applications found</p>
                <button onClick={() => setShowApplyModal(true)} className="action-btn metal-btn neon-pink">
                  Apply Now
                </button>
              </div>
            ) : paginatedScholarships.map((scholarship, index) => (
              <div 
                className={`application-item metal-item ${selectedScholarship?.id === scholarship.id ? "selected" : ""} ${scholarship.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedScholarship(scholarship)}
              >
                <div className="app-title">{scholarship.name}</div>
                <div className="app-meta">
                  <span>Academic Score: {scholarship.publicValue1}/10</span>
                  <span>Applied: {new Date(scholarship.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="app-status">
                  Status: {scholarship.isVerified ? "✅ Income Verified" : "🔒 Encrypted"}
                  {scholarship.isVerified && scholarship.decryptedValue && (
                    <span className="verified-income">Income: ${scholarship.decryptedValue}</span>
                  )}
                </div>
                <div className="app-creator">Applicant: {scholarship.creator.substring(0, 6)}...{scholarship.creator.substring(38)}</div>
              </div>
            ))}
          </div>
          
          {totalPages > 1 && (
            <div className="pagination metal-panel">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
                disabled={currentPage === 1}
                className="page-btn metal-btn"
              >
                Previous
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
                disabled={currentPage === totalPages}
                className="page-btn metal-btn"
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div className="history-panel metal-panel">
          <h3>Your Activity History</h3>
          <div className="history-list">
            {userHistory.length === 0 ? (
              <p>No activity recorded yet</p>
            ) : (
              userHistory.slice(-5).map((entry, index) => (
                <div key={index} className="history-entry metal-item">
                  {entry}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {showApplyModal && (
        <ApplyModal 
          onSubmit={applyScholarship} 
          onClose={() => setShowApplyModal(false)} 
          applying={applying} 
          application={newApplication} 
          setApplication={setNewApplication}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedScholarship && (
        <DetailModal 
          scholarship={selectedScholarship} 
          onClose={() => { 
            setSelectedScholarship(null); 
            setDecryptedIncome(null); 
          }} 
          decryptedIncome={decryptedIncome} 
          setDecryptedIncome={setDecryptedIncome} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedScholarship.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            <div className="toast-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="toast-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ApplyModal: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  applying: boolean;
  application: any;
  setApplication: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, applying, application, setApplication, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'income') {
      const intValue = value.replace(/[^\d]/g, '');
      setApplication({ ...application, [name]: intValue });
    } else {
      setApplication({ ...application, [name]: value });
    }
  };

  return (
    <div className="modal-overlay metal-overlay">
      <div className="apply-modal metal-modal">
        <div className="modal-header">
          <h2>New Scholarship Application</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice metal-notice">
            <strong>FHE Privacy Protection 🔐</strong>
            <p>Your income data will be encrypted with homomorphic encryption</p>
          </div>
          
          <div className="form-group">
            <label>Full Name *</label>
            <input 
              type="text" 
              name="name" 
              value={application.name} 
              onChange={handleChange} 
              placeholder="Enter your full name..." 
              className="metal-input"
            />
          </div>
          
          <div className="form-group">
            <label>Annual Income (Integer only) *</label>
            <input 
              type="number" 
              name="income" 
              value={application.income} 
              onChange={handleChange} 
              placeholder="Enter annual income..." 
              step="1"
              min="0"
              className="metal-input"
            />
            <div className="data-label">FHE Encrypted</div>
          </div>
          
          <div className="form-group">
            <label>Academic Score (1-10) *</label>
            <input 
              type="number" 
              min="1" 
              max="10" 
              name="score" 
              value={application.score} 
              onChange={handleChange} 
              placeholder="Enter academic score..." 
              className="metal-input"
            />
            <div className="data-label">Public Data</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn metal-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={applying || isEncrypting || !application.name || !application.income || !application.score} 
            className="submit-btn metal-btn neon-pink"
          >
            {applying || isEncrypting ? "Encrypting and Submitting..." : "Submit Application"}
          </button>
        </div>
      </div>
    </div>
  );
};

const DetailModal: React.FC<{
  scholarship: ScholarshipData;
  onClose: () => void;
  decryptedIncome: number | null;
  setDecryptedIncome: (value: number | null) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ scholarship, onClose, decryptedIncome, setDecryptedIncome, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    if (decryptedIncome !== null) { 
      setDecryptedIncome(null); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedIncome(decrypted);
    }
  };

  const isEligible = scholarship.isVerified ? 
    (scholarship.decryptedValue || 0) < 50000 && scholarship.publicValue1 >= 7 :
    decryptedIncome !== null ? decryptedIncome < 50000 && scholarship.publicValue1 >= 7 : false;

  return (
    <div className="modal-overlay metal-overlay">
      <div className="detail-modal metal-modal">
        <div className="modal-header">
          <h2>Application Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="app-info">
            <div className="info-item">
              <span>Applicant Name:</span>
              <strong>{scholarship.name}</strong>
            </div>
            <div className="info-item">
              <span>Wallet Address:</span>
              <strong>{scholarship.creator.substring(0, 6)}...{scholarship.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Application Date:</span>
              <strong>{new Date(scholarship.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Academic Score:</span>
              <strong>{scholarship.publicValue1}/10</strong>
            </div>
          </div>
          
          <div className="income-section">
            <h3>Encrypted Income Data</h3>
            
            <div className="data-row">
              <div className="data-label">Annual Income:</div>
              <div className="data-value">
                {scholarship.isVerified && scholarship.decryptedValue ? 
                  `$${scholarship.decryptedValue} (Verified)` : 
                  decryptedIncome !== null ? 
                  `$${decryptedIncome} (Decrypted)` : 
                  "🔒 FHE Encrypted"
                }
              </div>
              <button 
                className={`decrypt-btn metal-btn ${(scholarship.isVerified || decryptedIncome !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "🔓 Verifying..." : scholarship.isVerified ? "✅ Verified" : decryptedIncome !== null ? "🔄 Re-verify" : "🔓 Verify Income"}
              </button>
            </div>
            
            <div className="fhe-info metal-notice">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>Homomorphic Verification</strong>
                <p>Income verification without exposing sensitive data</p>
              </div>
            </div>
          </div>
          
          {(scholarship.isVerified || decryptedIncome !== null) && (
            <div className="eligibility-section">
              <h3>Scholarship Eligibility</h3>
              <div className={`eligibility-status ${isEligible ? 'eligible' : 'ineligible'}`}>
                {isEligible ? "✅ Eligible for Scholarship" : "❌ Not Eligible"}
              </div>
              
              <div className="criteria-list">
                <div className="criterion">
                  <span>Income below $50,000:</span>
                  <strong>{scholarship.isVerified ? scholarship.decryptedValue || 0 : decryptedIncome || 0} < 50,000</strong>
                  <span className={`status ${(scholarship.isVerified ? (scholarship.decryptedValue || 0) : (decryptedIncome || 0)) < 50000 ? 'met' : 'not-met'}`}>
                    {(scholarship.isVerified ? (scholarship.decryptedValue || 0) : (decryptedIncome || 0)) < 50000 ? '✓' : '✗'}
                  </span>
                </div>
                <div className="criterion">
                  <span>Academic score ≥ 7/10:</span>
                  <strong>{scholarship.publicValue1} ≥ 7</strong>
                  <span className={`status ${scholarship.publicValue1 >= 7 ? 'met' : 'not-met'}`}>
                    {scholarship.publicValue1 >= 7 ? '✓' : '✗'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn metal-btn">Close</button>
          {!scholarship.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn metal-btn neon-blue"
            >
              {isDecrypting ? "Verifying..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;


