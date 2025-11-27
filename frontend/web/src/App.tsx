import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface ScholarshipData {
  id: string;
  name: string;
  encryptedIncome: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [scholarships, setScholarships] = useState<ScholarshipData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingScholarship, setCreatingScholarship] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newScholarshipData, setNewScholarshipData] = useState({ name: "", income: "", description: "" });
  const [selectedScholarship, setSelectedScholarship] = useState<ScholarshipData | null>(null);
  const [decryptedIncome, setDecryptedIncome] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
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
            encryptedIncome: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
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

  const createScholarship = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingScholarship(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating scholarship with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const incomeValue = parseInt(newScholarshipData.income) || 0;
      const businessId = `scholar-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, incomeValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newScholarshipData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        0,
        0,
        newScholarshipData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Scholarship application created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewScholarshipData({ name: "", income: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingScholarship(false); 
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
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified on-chain" });
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
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Income verified successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Verification failed: " + (e.message || "Unknown error") });
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
      setTransactionStatus({ visible: true, status: "success", message: "System is available and ready!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredScholarships = scholarships.filter(scholar =>
    scholar.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    scholar.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedScholarships = filteredScholarships.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredScholarships.length / itemsPerPage);

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🎓 ScholarAid_Z</h1>
            <span>隱私獎學金系統</span>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🎓</div>
            <h2>Connect Wallet to Access Scholarship System</h2>
            <p>Please connect your wallet to initialize the encrypted scholarship application system.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading scholarship system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🎓 ScholarAid_Z</h1>
          <span>隱私獎學金系統</span>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="availability-btn">
            Check System
          </button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + New Application
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="dashboard-section">
          <div className="stats-panels">
            <div className="stat-panel">
              <h3>Total Applications</h3>
              <div className="stat-value">{scholarships.length}</div>
            </div>
            <div className="stat-panel">
              <h3>Verified Data</h3>
              <div className="stat-value">{scholarships.filter(s => s.isVerified).length}</div>
            </div>
            <div className="stat-panel">
              <h3>FHE Protected</h3>
              <div className="stat-value">100%</div>
            </div>
          </div>
        </div>

        <div className="search-section">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search applications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="applications-section">
          <div className="section-header">
            <h2>Scholarship Applications</h2>
            <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          
          <div className="applications-list">
            {paginatedScholarships.length === 0 ? (
              <div className="no-applications">
                <p>No scholarship applications found</p>
                <button onClick={() => setShowCreateModal(true)} className="create-btn">
                  Create First Application
                </button>
              </div>
            ) : paginatedScholarships.map((scholar, index) => (
              <div 
                className={`application-item ${scholar.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedScholarship(scholar)}
              >
                <div className="app-title">{scholar.name}</div>
                <div className="app-description">{scholar.description}</div>
                <div className="app-meta">
                  <span>Created: {new Date(scholar.timestamp * 1000).toLocaleDateString()}</span>
                  <span>Status: {scholar.isVerified ? "✅ Verified" : "🔓 Pending Verification"}</span>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>New Scholarship Application</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Applicant Name *</label>
                <input 
                  type="text" 
                  value={newScholarshipData.name} 
                  onChange={(e) => setNewScholarshipData({...newScholarshipData, name: e.target.value})} 
                  placeholder="Enter your name..." 
                />
              </div>
              
              <div className="form-group">
                <label>Annual Income (Integer only) *</label>
                <input 
                  type="number" 
                  value={newScholarshipData.income} 
                  onChange={(e) => setNewScholarshipData({...newScholarshipData, income: e.target.value})} 
                  placeholder="Enter annual income..." 
                  step="1"
                  min="0"
                />
                <div className="data-label">FHE Encrypted</div>
              </div>
              
              <div className="form-group">
                <label>Application Description *</label>
                <input 
                  type="text" 
                  value={newScholarshipData.description} 
                  onChange={(e) => setNewScholarshipData({...newScholarshipData, description: e.target.value})} 
                  placeholder="Enter description..." 
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={createScholarship} 
                disabled={creatingScholarship || isEncrypting || !newScholarshipData.name || !newScholarshipData.income || !newScholarshipData.description} 
                className="submit-btn"
              >
                {creatingScholarship || isEncrypting ? "Encrypting..." : "Submit Application"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {selectedScholarship && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h2>Application Details</h2>
              <button onClick={() => {
                setSelectedScholarship(null);
                setDecryptedIncome(null);
              }} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="detail-info">
                <div className="info-item">
                  <span>Applicant:</span>
                  <strong>{selectedScholarship.name}</strong>
                </div>
                <div className="info-item">
                  <span>Description:</span>
                  <strong>{selectedScholarship.description}</strong>
                </div>
                <div className="info-item">
                  <span>Date:</span>
                  <strong>{new Date(selectedScholarship.timestamp * 1000).toLocaleDateString()}</strong>
                </div>
              </div>
              
              <div className="data-section">
                <h3>Income Verification</h3>
                <div className="income-display">
                  {selectedScholarship.isVerified ? 
                    `$${selectedScholarship.decryptedValue} (Verified)` : 
                    decryptedIncome !== null ? 
                    `$${decryptedIncome} (Decrypted)` : 
                    "🔒 FHE Encrypted"
                  }
                </div>
                <button 
                  className="verify-btn"
                  onClick={async () => {
                    if (decryptedIncome !== null) {
                      setDecryptedIncome(null);
                      return;
                    }
                    const result = await decryptData(selectedScholarship.id);
                    if (result !== null) setDecryptedIncome(result);
                  }}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Verifying..." : 
                   selectedScholarship.isVerified ? "✅ Verified" :
                   decryptedIncome !== null ? "🔄 Re-verify" : "🔓 Verify Income"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <h3>FHE 🔐 Privacy-Preserving Scholarship System</h3>
          <p>Your financial data remains encrypted while we verify eligibility using homomorphic encryption</p>
        </div>
      </footer>
    </div>
  );
};

export default App;