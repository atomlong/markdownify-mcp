import sys
import argparse
from pypdf import PdfReader, PdfWriter

def split_pdf(input_path, output_path, start_page=None, end_page=None):
    try:
        reader = PdfReader(input_path)
        writer = PdfWriter()
        
        total_pages = len(reader.pages)
        
        # Convert 1-based indexing to 0-based
        # If start_page is not provided, start from 0
        start_idx = (start_page - 1) if start_page is not None else 0
        
        # If end_page is not provided, go to the end
        end_idx = end_page if end_page is not None else total_pages
        
        # Validate range
        if start_idx < 0:
            start_idx = 0
        if end_idx > total_pages:
            end_idx = total_pages
        if start_idx >= end_idx:
            print(f"Error: Invalid page range {start_page}-{end_page} for document with {total_pages} pages.")
            sys.exit(1)
            
        for i in range(start_idx, end_idx):
            writer.add_page(reader.pages[i])
            
        with open(output_path, "wb") as f:
            writer.write(f)
            
        print(f"Successfully created split PDF with pages {start_idx+1}-{end_idx}")
        
    except Exception as e:
        print(f"Error splitting PDF: {e}")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Split PDF pages")
    parser.add_argument("input", help="Input PDF file path")
    parser.add_argument("output", help="Output PDF file path")
    parser.add_argument("--start", type=int, help="Start page (1-based, inclusive)")
    parser.add_argument("--end", type=int, help="End page (1-based, inclusive)")
    
    args = parser.parse_args()
    
    split_pdf(args.input, args.output, args.start, args.end)