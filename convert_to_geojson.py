import csv
import json
input_file="ev_stations_raw.csv"
output_file="stations.geojson"
features=[]
total_rows=0
rows_skipped=0

with open(input_file,"r",encoding="utf-8") as csv_file:
    reader=csv.DictReader(csv_file)
    for row in reader:
        total_rows+=1
        station_id=row["station_id"].strip()
        name=row["name"].strip()
        operator=row["operator"].strip()
        connector_type=row["connector_type"].strip()

        # Handle missing station name
        if not name:
            name="Unnamed Station"

        # Validate latitude
        try:
            latitude=float(row["latitude"])
            if not -90 <= latitude <= 90:
                    print(f"Skipped {station_id}:invalid or missing latitude")
                    rows_skipped+=1
                    continue

        except(ValueError,TypeError):
                    print(f"Skipped {station_id}:invalid or missing latitude")
                    rows_skipped+=1
                    continue

        # Validate longitude
        try:
            longitude=float(row["longitude"])
            if not -180 <= longitude <= 180:
                    print(f"Skipped {station_id}:invalid or missing longitude")
                    rows_skipped += 1
                    continue
            
        except(ValueError, TypeError):
                    print(f"Skipped {station_id}:invalid or missing longitude")
                    rows_skipped += 1
                    continue

        # Convert power to number
        try:
            power_kw=float(row["power_kw"])
        except(ValueError,TypeError):
            print(f"Skipped{station_id}:invalid or missing power_kw")
            rows_skipped+=1
            continue

        feature={
            "type":"Feature",
            "geometry":{
                "type":"Point",
                "coordinates":[longitude, latitude]
            },
            "properties":{
                "station_id":station_id,
                "name":name,
                "operator":operator,
                "connector_type":connector_type,
                "power_kw":power_kw
            }
        }
        features.append(feature)

geojson={
    "type":"FeatureCollection",
    "features":features
}

with open(output_file,"w",encoding="utf-8") as json_file:
    json.dump(geojson,json_file,indent=2)

print("\n--- Summary ---")
print(f"Total rows read: {total_rows}")
print(f"Rows written: {len(features)}")
print(f"Rows skipped: {rows_skipped}")
print(f"GeoJSON created: {output_file}")