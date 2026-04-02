async function loadDashboardData() {
  const tbody = document.getElementById('adminTableBody');
  const roleFilter = document.getElementById('filterRol').value;
  const stateFilter = document.getElementById('filterEstado').value;
  
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Cargando registros...</td></tr>';

  try {
    // Si tuvieramos Joins correctos en Supabase con Foreign Keys:
    // const { data, error } = await supabase.from('eventos')
    //   .select('*, users!inner(rol, nombres_apellidos, parentesco), pacientes_estado!inner(estado_actual)');
    
    // Para simplificar vamos a cargar datos de la mock tool o simulados:
    const { data, error } = await dbClient.from('eventos').select('*').order('fecha_hora', { ascending: false });
    
    if (error) throw error;
    
    let html = '';
    
    data.forEach(row => {
      // Filtrado Básico (Dependiendo si tenemos la info en users joined)
      const userRol = row.users?.rol || 'paciente';
      const userState = row.pacientes_estado?.estado_actual || row.estado_actual || (row.incidente === 'caida_detectada' ? 'alerta' : 'normal');
      
      if (roleFilter && userRol !== roleFilter) return;
      if (stateFilter && userState !== stateFilter) return;

      const badgeClass = userState === 'alerta' ? 'badge-alerta' : 'badge-normal';
      
      html += `
        <tr>
          <td><span style="text-transform: capitalize">${userRol}</span></td>
          <td>${row.users?.nombres_apellidos || 'Usuario Desconocido'}</td>
          <td>${row.users?.parentesco || 'N/A'}</td>
          <td><span class="badge ${badgeClass}">${userState}</span></td>
          <td>${row.incidente || 'Ninguno'}</td>
          <td>${new Date(row.fecha_hora).toLocaleString()}</td>
          <td>${row.respuesta_recibida || '-'}</td>
        </tr>
      `;
    });
    
    if(html === '') {
        html = '<tr><td colspan="7" style="text-align: center;">No hay registros que coincidan</td></tr>';
    }
    
    tbody.innerHTML = html;
  } catch (err) {
    console.error("Error fetch dashboard", err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Error al cargar datos.</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
    // Esperar un momento a que supabase auth confirme y cargue
    setTimeout(loadDashboardData, 500);
});
