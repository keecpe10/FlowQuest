import os
from flask import Flask
from app import app, db
from models import UserMission, MCQUserAnswer

def cleanup_duplicates():
    with app.app_context():
        print("Starting UserMission cleanup...")
        
        # Get all user missions
        all_ums = UserMission.query.all()
        
        # Group by (user_id, mission_id)
        grouped = {}
        for um in all_ums:
            key = (um.user_id, um.mission_id)
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(um)
            
        duplicates_found = 0
        deleted_count = 0
        
        for key, ums in grouped.items():
            if len(ums) > 1:
                duplicates_found += 1
                user_id, mission_id = key
                print(f"Found {len(ums)} records for user_id={user_id}, mission_id={mission_id}")
                
                # Sort by updated_at descending so newest is first
                ums.sort(key=lambda x: (x.status == 'completed', x.updated_at or x.created_at), reverse=True)
                
                # The first one is our keeper (completed ones are prioritized, then newest)
                keeper = ums[0]
                
                # The rest will be deleted
                for duplicate in ums[1:]:
                    print(f"  Keeping ID {keeper.user_mission_id} (status: {keeper.status}). Deleting ID {duplicate.user_mission_id} (status: {duplicate.status})")
                    
                    # Optional: We could merge answers, but usually it's best to just delete the orphaned row
                    # since we fixed the race condition. MCQUserAnswer has ON DELETE CASCADE on user_mission_id
                    db.session.delete(duplicate)
                    deleted_count += 1
                    
        if deleted_count > 0:
            db.session.commit()
            print(f"Cleanup complete. Deleted {deleted_count} duplicate records.")
        else:
            print("No duplicates found to delete.")

if __name__ == '__main__':
    cleanup_duplicates()
