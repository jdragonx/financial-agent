#!/usr/bin/env python3
"""
Example script demonstrating how to use the Partner Recommendation API.
Make sure the API server is running before executing this script.
"""
import requests
import json

API_BASE_URL = "http://localhost:8000"


def create_partner(name, description, industry=None, location=None, **kwargs):
    """Create a new partner"""
    data = {
        "name": name,
        "description": description,
        "industry": industry,
        "location": location,
        **kwargs
    }
    response = requests.post(f"{API_BASE_URL}/partners/", json=data)
    response.raise_for_status()
    return response.json()


def search_partners(query, top_n=5):
    """Search for partners using natural language query"""
    data = {
        "query": query,
        "top_n": top_n
    }
    response = requests.post(f"{API_BASE_URL}/recommendations/search", json=data)
    response.raise_for_status()
    return response.json()


def main():
    print("=== Partner Recommendation API Example ===\n")
    
    # Create some example partners
    print("1. Creating example partners...")
    
    partners = [
        {
            "name": "TechCorp Financial",
            "description": "Leading fintech company specializing in payment processing and digital wallets",
            "industry": "Financial Technology",
            "location": "San Francisco, CA",
            "website": "https://techcorp-financial.com",
            "contact_email": "contact@techcorp-financial.com"
        },
        {
            "name": "GreenEnergy Solutions",
            "description": "Renewable energy consulting and solar panel installation services",
            "industry": "Energy",
            "location": "Austin, TX",
            "website": "https://greenenergy-solutions.com",
            "contact_email": "info@greenenergy-solutions.com"
        },
        {
            "name": "DataFlow Analytics",
            "description": "Big data analytics and machine learning consulting for enterprise clients",
            "industry": "Technology",
            "location": "Seattle, WA",
            "website": "https://dataflow-analytics.com",
            "contact_email": "sales@dataflow-analytics.com"
        },
        {
            "name": "HealthCare Plus",
            "description": "Healthcare technology solutions for hospitals and clinics",
            "industry": "Healthcare",
            "location": "Boston, MA",
            "website": "https://healthcare-plus.com",
            "contact_email": "info@healthcare-plus.com"
        },
        {
            "name": "SecurePay Systems",
            "description": "Enterprise payment security and fraud detection solutions",
            "industry": "Financial Technology",
            "location": "New York, NY",
            "website": "https://securepay-systems.com",
            "contact_email": "contact@securepay-systems.com"
        }
    ]
    
    created_partners = []
    for partner_data in partners:
        try:
            partner = create_partner(**partner_data)
            created_partners.append(partner)
            print(f"   ✓ Created: {partner['name']}")
        except Exception as e:
            print(f"   ✗ Failed to create {partner_data['name']}: {e}")
    
    print(f"\n2. Created {len(created_partners)} partners\n")
    
    # Test search queries
    print("3. Testing search queries...\n")
    
    test_queries = [
        "I'm looking for a fintech company in San Francisco that specializes in payment processing",
        "Find me a renewable energy company",
        "I need a healthcare technology partner",
        "Show me companies that work with big data and analytics"
    ]
    
    for query in test_queries:
        print(f"Query: '{query}'")
        try:
            results = search_partners(query, top_n=3)
            print(f"   Found {len(results['results'])} results:")
            for i, result in enumerate(results['results'], 1):
                print(f"   {i}. {result['partner']['name']} (Score: {result['score']:.4f})")
                print(f"      Industry: {result['partner']['industry']}")
                print(f"      Location: {result['partner']['location']}")
            print()
        except Exception as e:
            print(f"   ✗ Search failed: {e}\n")
    
    print("=== Example completed ===")


if __name__ == "__main__":
    main()


