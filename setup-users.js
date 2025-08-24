import 'dotenv/config';
import { db } from './server/db.js';
import { users } from './shared/schema.js';
import { hashPassword } from './server/auth.js';

async function setupUsers() {
  try {
    // Create test employee
    const hashedPassword = await hashPassword('test123');
    
    const employee = await db.insert(users).values({
      username: 'employee1',
      password: hashedPassword,
      role: 'employee',
      employeeId: 'EMP001',
      department: 'General'
    }).returning();
    
    console.log('✅ Employee created:');
    console.log('Username: employee1');
    console.log('Password: test123');
    
  } catch (error) {
    if (error.code === '23505') {
      console.log('Employee already exists');
    } else {
      console.error('Error:', error.message);
    }
  }
  
  process.exit(0);
}

setupUsers();