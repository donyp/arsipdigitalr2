-- Fleet Management System Tables
-- Tracks vehicles, their important documents, and maintenance history

-- 1. VEHICLES TABLE
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number VARCHAR(20) NOT NULL UNIQUE,
    vehicle_type VARCHAR(50) NOT NULL CHECK (vehicle_type IN ('T120SS BOX', 'TRAGA BOX', 'ENGKEL BOX', 'DOUBLE BOX')),
    vehicle_name VARCHAR(100) NOT NULL,
    brand_model VARCHAR(100),
    year_manufacture INTEGER,
    color VARCHAR(50),
    engine_number VARCHAR(50),
    chassis_number VARCHAR(50),
    vin VARCHAR(100),
    purchase_date DATE,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- 2. VEHICLE DOCUMENTS TABLE (untuk tracking KIR, PAJAK, STNK, PLAT)
CREATE TABLE IF NOT EXISTS vehicle_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    plate_number VARCHAR(20) NOT NULL,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('KIR', 'PAJAK_STNK', 'PLAT')),
    issue_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    document_number VARCHAR(100),
    issued_by VARCHAR(100),
    document_file_path TEXT,
    renewal_status VARCHAR(50) DEFAULT 'PENDING' CHECK (renewal_status IN ('PENDING', 'IN_PROGRESS', 'RENEWED', 'EXPIRED')),
    renewal_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- 3. VEHICLE MAINTENANCE TABLE (untuk service dan ganti ban)
CREATE TABLE IF NOT EXISTS vehicle_maintenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    plate_number VARCHAR(20) NOT NULL,
    maintenance_type VARCHAR(50) NOT NULL CHECK (maintenance_type IN ('SERVICE', 'TIRE_REPLACEMENT', 'REPAIR', 'OTHER')),
    service_date DATE NOT NULL,
    description TEXT NOT NULL,
    cost DECIMAL(15, 2),
    odometer_reading INTEGER,
    maintenance_provider VARCHAR(100),
    next_service_date DATE,
    parts_replaced TEXT,
    notes TEXT,
    maintenance_file_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- INDEXES untuk performance
CREATE INDEX IF NOT EXISTS idx_vehicles_plate_number ON vehicles(plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_active ON vehicles(is_active);
CREATE INDEX IF NOT EXISTS idx_vehicles_type ON vehicles(vehicle_type);

CREATE INDEX IF NOT EXISTS idx_vehicle_documents_vehicle_id ON vehicle_documents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_plate_number ON vehicle_documents(plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_expiration_date ON vehicle_documents(expiration_date);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_type ON vehicle_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_renewal_status ON vehicle_documents(renewal_status);

CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_vehicle_id ON vehicle_maintenance(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_plate_number ON vehicle_maintenance(plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_service_date ON vehicle_maintenance(service_date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_type ON vehicle_maintenance(maintenance_type);

-- COMMENTS untuk dokumentasi
COMMENT ON TABLE vehicles IS 'Daftar armada kendaraan operasional';
COMMENT ON COLUMN vehicles.plate_number IS 'Nomor plat kendaraan (unik)';
COMMENT ON COLUMN vehicles.vehicle_type IS 'Tipe kendaraan: T120SS BOX, TRAGA BOX, ENGKEL BOX, atau DOUBLE BOX';
COMMENT ON COLUMN vehicles.is_active IS 'Status kendaraan aktif/non-aktif';

COMMENT ON TABLE vehicle_documents IS 'Dokumen penting kendaraan dengan tracking tanggal expired';
COMMENT ON COLUMN vehicle_documents.document_type IS 'Tipe dokumen: KIR, PAJAK_STNK, PLAT';
COMMENT ON COLUMN vehicle_documents.renewal_status IS 'Status perpanjangan dokumen';

COMMENT ON TABLE vehicle_maintenance IS 'History pemeliharaan dan perbaikan kendaraan';
COMMENT ON COLUMN vehicle_maintenance.maintenance_type IS 'Tipe pemeliharaan: SERVICE, TIRE_REPLACEMENT, REPAIR, atau OTHER';
COMMENT ON COLUMN vehicle_maintenance.next_service_date IS 'Tanggal service berikutnya direkomendasikan';

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_maintenance ENABLE ROW LEVEL SECURITY;
