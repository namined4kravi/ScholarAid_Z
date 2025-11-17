# Confidential Scholarship

Confidential Scholarship is a privacy-preserving application that empowers educational institutions and applicants by leveraging Zama's Fully Homomorphic Encryption (FHE) technology. This innovative platform enables the submission of encrypted income proof while ensuring secure and confidential qualification verification. 

## The Problem

In the current landscape of educational funding, applicants often have to submit sensitive personal information, including income proof, to qualify for scholarships and financial aid. This practice not only raises significant privacy concerns but also exposes applicants to the risk of data breaches and identity theft. Cleartext data can be dangerous, leading to unauthorized access and misuse of personal information.

## The Zama FHE Solution

Zama's Fully Homomorphic Encryption (FHE) addresses these privacy and security challenges. FHE allows for computation on encrypted data without needing to decrypt it first. This means the system can verify qualifications based on encrypted income proof without ever exposing sensitive details. Using Zama's fhEVM, we can efficiently process encrypted inputs, ensuring that user privacy is maintained throughout the scholarship application process.

## Key Features

- 🔒 **Privacy Protection**: Safeguard sensitive personal information during the scholarship application process.
- ✅ **Eligibility Verification**: Conduct qualification checks while keeping all data encrypted.
- 📊 **Transparent Process**: Provide a clear and secure pathway for applicants to submit income proof.
- 🎓 **Empowerment**: Enable educational institutions to support deserving applicants without compromising their privacy.
- 💼 **Secure Financial Aid**: Facilitate confidential processing for scholarships and financial support.

## Technical Architecture & Stack

- **Core Privacy Engine**: Zama FHE (using Concrete ML and fhEVM)
- **Frontend**: React for user interface
- **Backend**: Node.js
- **Smart Contract**: Solidity for on-chain interactions

The architecture is designed to ensure high security and efficiency, leveraging Zama's innovative technology stack to provide a robust solution for scholarship management.

## Smart Contract / Core Logic

Here's a pseudo-code example showcasing how we leverage Zama's technology within our smart contracts:solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Import Zama's FHE primitives
import "TFHE.sol";

contract ConfidentialScholarship {
    struct Applicant {
        uint64 encryptedIncomeProof;
        bool isVerified;
    }

    mapping(address => Applicant) public applicants;

    function submitIncomeProof(uint64 encryptedIncome) public {
        applicants[msg.sender].encryptedIncomeProof = encryptedIncome;
        applicants[msg.sender].isVerified = false;
    }

    function verifyEligibility(address applicantAddress) public {
        // Decrypt and verify eligibility using FHE
        uint64 decryptedIncome = TFHE.decrypt(applicants[applicantAddress].encryptedIncomeProof);
        if (decryptedIncome > threshold) {
            applicants[applicantAddress].isVerified = true;
        }
    }
}

This snippet illustrates how applicants can submit their encrypted income proofs and how the verification process is handled securely without exposing sensitive data.

## Directory Structure

Here's a visual representation of the project structure:
ConfidentialScholarship/
│
├── contracts/
│   └── ConfidentialScholarship.sol
│
├── src/
│   ├── components/
│   ├── App.js
│   └── index.js
│
├── scripts/
│   └── deploy.js
│
├── package.json
└── README.md

The structure is designed to facilitate ease of development and maintainability, with a dedicated directory for smart contracts, a source directory for the frontend, and scripts for deployment.

## Installation & Setup

### Prerequisites

To get started, ensure you have the following installed:

- Node.js
- npm (Node package manager)

### Installation Steps

1. **Install Dependencies**: Navigate to your project directory and run the following command to install the necessary packages:bash
   npm install

2. **Install Zama Libraries**: Ensure that the core Zama library for FHE is also installed:bash
   npm install fhevm

## Build & Run

To build and run the application, execute the following commands:

1. **Compile Smart Contracts**: Use Hardhat to compile the smart contracts:bash
   npx hardhat compile

2. **Run the Application**: Start the application:bash
   npm start

Navigating to the indicated address will launch the application, allowing users to begin the scholarship application process securely.

## Acknowledgements

We would like to extend our deepest gratitude to Zama for providing the open-source FHE primitives that make this project possible. Their cutting-edge technology empowers us to build a secure and privacy-centric platform for scholarship funding, ensuring applicants can safely pursue their educational goals.

---

Confidential Scholarship not only transforms how financial aid is distributed but also sets a new standard for privacy in the education sector. By leveraging Zama's FHE technology, we can create a system that respects and protects everyone’s data while fostering opportunities for growth and learning.


